import "dotenv/config";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import type { Page } from "playwright-core";
import { launchBrowser, newContextFromState } from "../src/crawlers/_shared/browser";

// Site exploration helper for rewriting the Lotte crawler against
// lottehotel.com. Usage: npx tsx scripts/debug-page.ts <step> [url]
// Steps: main | login | resort | search | bizcds | dom | lpoint | doLogin |
//        keys | roomlist | member | custom (custom just opens [url] and dumps)
// `keys`는 roomList 응답 키 전수 조사다 — 요금(roomAvgAmt)과 정원(capacity/
// maxCapacity)이 둘 다 거기서 나왔다. 로그인이 필요 없다(BAR는 공개다).
// `member`는 그 조사가 **비로그인으로만** 이뤄졌다는 공백을 메운다 — 아래 그 절.
const OUT = process.env.DEBUG_OUT ?? "/tmp/lotte-debug";

/**
 * 로그인한 컨텍스트를 파일로 남긴다 — 나머지 네 크롤러의 디버그 스크립트가
 * 전부 갖고 있는 규약이고(`debug-hanwha.ts:62` 등), 롯데만 없었다.
 *
 * **편의가 아니라 계정 보호다.** 이 사이트의 로그인은 다섯 중 가장 무르고
 * (넷퍼넬 + Imperva), 실계정은 법인 계정이라 반복 실패에 잠금 위험이 있다.
 * 질문마다 로그인하면 그 위험을 질문 수만큼 곱한다 — 조사는 로그인 1회로 끝나야 한다.
 */
const STATE_FILE = `${OUT}-state.json`;

/**
 * 저장된 세션을 **일부러** 읽지 않는 스텝들.
 *
 * `keys`와 `roomlist`는 비로그인인 것이 설계다. 두 스텝의 주석이 그렇게 적고 있고,
 * `AGENTS.md`의 정원 표는 그 census의 출처를 "비로그인 BAR 호출"이라고 명시한다.
 * 세션 파일이 생겼다는 이유로 이것들이 조용히 인증되기 시작하면, 같은 명령이
 * **다른 질문에 답하면서 예전 표와 나란히 비교된다.** 그래서 목록을 명시하고,
 * 모든 스텝이 자기 상태를 출력 첫 줄에 찍는다.
 */
const ANON_STEPS = new Set(["keys", "roomlist", "doLogin"]);

function saveState(state: unknown, why: string) {
  writeFileSync(STATE_FILE, JSON.stringify(state));
  console.log(`[state] saved ${STATE_FILE} (${why})`);
}

async function acceptCookies(page: Page) {
  try {
    await page.getByRole("button", { name: "전체 동의" }).click({ timeout: 5_000 });
    console.log("[cookies] accepted");
    await page.waitForTimeout(1_000);
  } catch {
    console.log("[cookies] banner absent");
  }
}

async function dump(page: Page, label: string) {
  console.log(`\n--- ${label} ---`);
  console.log("url:", page.url());
  console.log("title:", await page.title());
  await page.screenshot({ path: `${OUT}-${label}.png`, fullPage: false });
  console.log(`screenshot: ${OUT}-${label}.png`);
}

async function dumpInputs(page: Page) {
  const inputs = await page.locator("input").evaluateAll((els) =>
    els.map((e) => ({
      type: e.getAttribute("type"),
      name: e.getAttribute("name"),
      id: e.getAttribute("id"),
      placeholder: e.getAttribute("placeholder"),
      ariaLabel: e.getAttribute("aria-label"),
      visible: (e as HTMLElement).offsetParent !== null,
    })),
  );
  console.log("inputs:", JSON.stringify(inputs.filter((i) => i.type !== "hidden"), null, 2));
}

async function dumpLinks(page: Page, containerSel: string, label: string) {
  const links = await page.locator(`${containerSel} a`).evaluateAll((els) =>
    els
      .map((e) => ({
        text: (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40),
        href: e.getAttribute("href"),
      }))
      .filter((l) => l.text || l.href),
  );
  console.log(`${label} links:`, JSON.stringify(links, null, 2));
}

// ─── 금액 조사 (2026-08-24) ──────────────────────────────────────────────
//
// Every crawler's payload interface calls itself a "Subset of the response we
// rely on". That is honest, and it means nobody has ever asked what else is in
// there — a rate could have been riding in every response since July and we
// would not know. These three helpers ask.
//
// `keyCensus` is `debug-hanwha.ts`'s `fingerprint()` run backwards. That one
// narrows a row to four fields on purpose, to compare two responses; this one
// widens to every field, to find out what a response even has.
//
// **Counting matters more than listing.** A rate that only rides on peak-season
// rows would appear in 3 entities out of 450, and `Object.keys(rows[0])` would
// miss precisely the thing we came for — silently, and the silence would read
// as "this site publishes no rates".

function keyCensus(label: string, rows: Array<Record<string, unknown>>) {
  console.log(`\n=== key census: ${label} — ${rows.length} entities ===`);
  if (!rows.length) {
    // Said out loud because an empty census looks exactly like a clean "no
    // rate key here", and it is not evidence of anything.
    console.log("  (no entities — this census proves nothing)");
    return;
  }
  const seen = new Map<string, unknown[]>();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row ?? {})) {
      const values = seen.get(k) ?? [];
      values.push(v);
      seen.set(k, values);
    }
  }
  const width = Math.max(...[...seen.keys()].map((k) => k.length));
  for (const [key, values] of [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const seenIn = `${values.length}/${rows.length}`.padStart(11);
    console.log(`  ${key.padEnd(width)} ${seenIn}  ${valueAlphabet(values)}`);
  }
  console.log("\n  two entities in full:");
  console.log(
    JSON.stringify(rows.slice(0, 2), null, 2)
      .split("\n")
      .map((l) => `  ${l}`)
      .join("\n"),
  );
}

/**
 * Distinct values when there are few enough to read, plus a numeric range
 * whenever every value parses as a number.
 *
 * The range is what makes a rate recognisable: a remaining-room count lands in
 * the single or double digits, a 원 amount in the hundred-thousands. Reading
 * key names alone would not separate them — `RM_REF1` looks like a reference
 * and holds "031" (a 평형 code), while a rate might be called something as
 * bland as `amt1`.
 */
function valueAlphabet(values: unknown[]): string {
  const distinct = [...new Set(values.map((v) => JSON.stringify(v) ?? "undefined"))];
  const nums = values.map(asNumber).filter((n): n is number => n !== null);
  const range =
    nums.length === values.length ? ` min=${Math.min(...nums)} max=${Math.max(...nums)}` : "";
  return distinct.length <= 12
    ? `{${distinct.join(", ")}}${range}`
    : `${distinct.length} distinct${range}  e.g. ${distinct.slice(0, 3).join(", ")}`;
}

/** "320,000" and "320000원" are numbers here; "", "Y" and null are not. */
function asNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const cleaned = v.replace(/[,\s원]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Every key of the envelope, arrays flagged by length rather than expanded.
 *
 * Each parser reaches straight for the one array it reads — hanwha's
 * `ds.Data.ds_result`, oakvalley's `entitys`. A sibling array carrying rates
 * would sit directly beside it and never be looked at.
 */
function envelopeKeys(label: string, payload: unknown, path = "", depth = 0) {
  if (!path) console.log(`\n=== envelope: ${label} ===`);
  if (Array.isArray(payload)) {
    console.log(`  ${path || "(root)"} [] length=${payload.length}`);
    return;
  }
  if (payload === null || typeof payload !== "object" || depth > 3) {
    console.log(`  ${path || "(root)"} = ${JSON.stringify(payload)?.slice(0, 100)}`);
    return;
  }
  for (const [k, v] of Object.entries(payload)) {
    envelopeKeys(label, v, path ? `${path}.${k}` : k, depth + 1);
  }
}

// ─── 회원가 조사 (2026-09-01) ─────────────────────────────────────────────
//
// 위 세 헬퍼는 "이 응답에 무엇이 있나"를 묻는다. 아래 넷은 다른 질문을 위한 것이다 —
// **"신원이 이 응답을 바꾸는가."**

/**
 * 돈처럼 보이는 필드. **이름과 값을 둘 다** 본다 (`debug-sono.ts`에서 가져왔다).
 *
 * 어느 한쪽만 보면 이 저장소가 이미 두 번 걸린 함정에 걸린다:
 *   이름만 → 요금 필드가 `amt1` 같은 밋밋한 이름이면 놓친다.
 *   값만  → 리솜 `rmAmt`는 이름이 정확한데 506행 전부 `"0"`이었다.
 *           **필드가 있다고 값이 있는 게 아니다.**
 */
const MONEY_KEY = /amt|price|rate|fee|cost|charge|money|won|금액|요금|가격/i;

/**
 * 신원처럼 보이는 필드. 회원가가 붙는다면 그 응답 어딘가에 **우리가 누구인지**가
 * 적혀 있을 공산이 크고, 그 칸의 이름이 곧 다음 요청에 실을 파라미터 이름이다.
 *
 * 값은 찍지 않고 모양만 찍는다 — 여기서는 **키가 발견이고 값이 비밀이다**
 * (`login.ts`의 `SAFE_FIELDS`는 반대 방향으로 같은 규율을 건다).
 */
const IDENTITY_KEY = /member|mbr|memb|cust|corp|cmpny|company|grade|grad|login|mno|회원|법인/i;

/**
 * 두 번 부르면 언제나 달라지는 칸. 응답 대조에서 세면 안 된다.
 *
 * 실측: 롯데 `roomList`의 `id`는 요청마다 새 UUID다. 이걸 세는 바람에 인증/익명
 * 대조가 "71행 전부 다름"으로 나왔는데, 그건 신원의 효과가 아니라 **두 번 물어본
 * 효과**였다. 대조에서 가장 먼저 의심할 것은 답이 아니라 질문이다.
 */
const VOLATILE_KEYS = new Set(["id"]);

/** 여섯 자리 이상 숫자는 금액일 수도 회원번호일 수도 있다. 모양만 남긴다. */
function redactValue(v: unknown): string {
  const str = String(v ?? "");
  if (str === "") return '""';
  return /^\d{6,}$/.test(str) ? `<${str.length} digits>` : JSON.stringify(str);
}

/** URL 쿼리에서 신원처럼 보이는 값만 가린다. 키·나머지 값은 그대로 남는다. */
function redactQuery(raw: string): string {
  try {
    const u = new URL(raw);
    for (const [k, v] of [...u.searchParams.entries()]) {
      if (IDENTITY_KEY.test(k) && /^\d{6,}$/.test(v)) u.searchParams.set(k, `<${v.length} digits>`);
    }
    return u.toString();
  } catch {
    return raw;
  }
}

interface MoneyHit {
  hits: number;
  byName: boolean;
  values: unknown[];
}

function moneyScan(
  payload: unknown,
  path = "",
  acc = new Map<string, MoneyHit>(),
): Map<string, MoneyHit> {
  if (Array.isArray(payload)) {
    // 인덱스를 지운 경로로 합산한다 — 열거보다 세기가 중요하다. 성수기 행에만 붙는
    // 요금은 450개 중 3개로 나타나고, `Object.keys(rows[0])`은 그걸 놓친다.
    for (const item of payload) moneyScan(item, `${path}[]`, acc);
    return acc;
  }
  if (payload === null || typeof payload !== "object") return acc;
  for (const [k, v] of Object.entries(payload)) {
    const p = path ? `${path}.${k}` : k;
    if (v !== null && typeof v === "object") {
      moneyScan(v, p, acc);
      continue;
    }
    const n = asNumber(v);
    const byName = MONEY_KEY.test(k);
    // 압축 날짜(20260907)가 액수 자릿수에 걸린다. 날짜는 모양으로 빼고 나머지는
    // 남겨서 사람이 판단하게 둔다 — 여기서 과하게 거르면 조사가 아니라 확인이 된다.
    const dateShaped = /^20\d{6}$/.test(String(v).trim());
    const byValue = n !== null && Number.isInteger(n) && Math.abs(n) >= 1_000 && !dateShaped;
    if (!byName && !byValue) continue;
    const hit = acc.get(p) ?? { hits: 0, byName, values: [] };
    hit.hits++;
    hit.byName = hit.byName || byName;
    if (hit.values.length < 6) hit.values.push(v);
    acc.set(p, hit);
  }
  return acc;
}

function reportMoney(label: string, payload: unknown) {
  const acc = moneyScan(payload);
  console.log(`\n=== money scan: ${label} ===`);
  if (acc.size === 0) {
    console.log("  (돈처럼 보이는 필드 없음 — 이름으로도, 값으로도)");
    return;
  }
  for (const [path, hit] of [...acc.entries()].sort((a, b) => b[1].hits - a[1].hits)) {
    const nums = hit.values.map(asNumber).filter((n): n is number => n !== null);
    const range = nums.length ? ` min=${Math.min(...nums)} max=${Math.max(...nums)}` : "";
    console.log(
      `  ${path}  ×${hit.hits}  (${hit.byName ? "이름" : "값"})  ` +
        `${JSON.stringify(hit.values).slice(0, 120)}${range}`,
    );
  }
}

/** 신원 필드 census. 이름으로 걸리거나, 값이 회원번호 모양이거나. */
function reportIdentity(label: string, rows: Array<Record<string, unknown>>) {
  console.log(`\n=== identity scan: ${label} ===`);
  const hits = new Map<string, unknown[]>();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row ?? {})) {
      const idShaped = typeof v === "string" && /^\d{6,}$/.test(v);
      if (!IDENTITY_KEY.test(k) && !idShaped) continue;
      hits.set(k, [...(hits.get(k) ?? []), v]);
    }
  }
  if (!hits.size) {
    console.log("  (신원처럼 보이는 필드 없음 — 이름으로도, 모양으로도)");
    return;
  }
  for (const [key, values] of [...hits.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const distinct = [...new Set(values.map(redactValue))];
    console.log(
      `  ${key}  ${values.length}/${rows.length}  ` +
        (distinct.length <= 8
          ? `{${distinct.join(", ")}}`
          : `${distinct.length} distinct  e.g. ${distinct.slice(0, 3).join(", ")}`),
    );
  }
}

/**
 * 이미 이름이 알려진 키만 다시 한 번. `keyCensus`가 49개를 전부 찍고 나면
 * 정작 이 조사가 온 이유인 네댓 개가 그 안에 묻힌다.
 */
function spotlight(rows: Array<Record<string, unknown>>, keys: string[]) {
  console.log("\n  주목 키:");
  for (const key of keys) {
    const values = rows.map((r) => r[key]).filter((v) => v !== undefined);
    console.log(
      `    ${key.padEnd(18)} ${String(values.length).padStart(3)}/${rows.length}  ` +
        (values.length ? valueAlphabet(values) : "(없음)"),
    );
  }
}

async function main() {
  const step = process.argv[2] ?? "main";
  const url = process.argv[3];
  const browser = await launchBrowser();

  // 상태를 읽었는지 **안 읽었는지**를 항상 말한다. 익명 결과를 인증 결과로 읽는 것이
  // 이 스크립트가 낼 수 있는 최악의 오답이고, 그 오답은 조용하다.
  const anonByDesign = ANON_STEPS.has(step);
  const hasState = existsSync(STATE_FILE);
  const stateAgeMin = hasState
    ? Math.round((Date.now() - statSync(STATE_FILE).mtimeMs) / 60_000)
    : null;
  const saved = !anonByDesign && hasState ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : null;
  console.log(
    anonByDesign
      ? `[state] anonymous by design (step=${step})`
      : saved
        ? `[state] reusing ${STATE_FILE} age=${stateAgeMin}m`
        : `[state] none — run \`doLogin\` first if this step needs a session`,
  );

  const context = await newContextFromState(browser, saved);
  const page = await context.newPage();

  if (step === "main") {
    await page.goto("https://www.lottehotel.com/global/ko", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(5_000);
    await acceptCookies(page);
    await dump(page, "main");
    await dumpLinks(page, "header", "header");
  } else if (step === "login") {
    await page.goto("https://www.lottehotel.com/global/ko", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(5_000);
    await acceptCookies(page);
    await page.getByRole("link", { name: "로그인" }).first().click({ timeout: 10_000 });
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(5_000);
    await dump(page, "login");
    await dumpInputs(page);
    const buttons = await page.getByRole("button").allInnerTexts();
    console.log("buttons:", JSON.stringify(buttons.filter(Boolean).slice(0, 30)));
    try {
      console.log("aria snapshot (form):");
      console.log(await page.locator("form").first().ariaSnapshot());
    } catch {
      console.log("(no form element)");
    }
  } else if (step === "resort") {
    await page.goto("https://www.lottehotel.com/resort-sokcho/ko", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(5_000);
    await acceptCookies(page);
    await dump(page, "resort");
    // Booking widget: dump anything that looks like the reservation panel
    const widgets = await page
      .locator("[class*='book'], [class*='reserv'], [id*='book'], [id*='reserv']")
      .evaluateAll((els) =>
        els.slice(0, 10).map((e) => ({
          tag: e.tagName,
          id: e.id,
          cls: e.className?.toString().slice(0, 80),
          text: (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 200),
        })),
      );
    console.log("booking-ish elements:", JSON.stringify(widgets, null, 2));
    const buttons = await page.getByRole("button").allInnerTexts();
    console.log("buttons:", JSON.stringify(buttons.filter(Boolean).slice(0, 40)));
  } else if (step === "search") {
    await page.goto("https://www.lottehotel.com/resort-sokcho/ko", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(5_000);
    await acceptCookies(page);
    await page.getByRole("button", { name: "검색" }).first().click({ timeout: 10_000 });
    await page.waitForTimeout(10_000);
    await dump(page, "search-result");
    // Where did we land? Dump result-page structure hints.
    const cards = await page
      .locator("[class*='room'], [class*='rate'], [class*='result']")
      .evaluateAll((els) =>
        els.slice(0, 15).map((e) => ({
          tag: e.tagName,
          cls: e.className?.toString().slice(0, 80),
          text: (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 150),
        })),
      );
    console.log("result elements:", JSON.stringify(cards, null, 2));
  } else if (step === "bizcds") {
    // Direct URL navigation (no id= token) — does the room list still render?
    const direct =
      "https://resort.lottehotel.com/main/ko/reservation/accommodation" +
      "?bizCd=81&checkinDt=20260801&checkoutDt=20260802&roomCnt=1&reservationType=BAR";
    await page.goto(direct, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(10_000);
    await acceptCookies(page);
    await dump(page, "direct");
    const cardTitles = await page
      .locator("[class*='room-item'], [class*='card'], li")
      .evaluateAll((els) =>
        els
          .map((e) => (e.textContent ?? "").trim().replace(/\s+/g, " "))
          .filter((t) => /디럭스|스위트|호텔|콘도|패밀리/.test(t) && t.length < 120)
          .slice(0, 10),
      );
    console.log("room-ish texts:", JSON.stringify(cardTitles, null, 2));

    // Room card DOM structure (for parse.ts)
    const cardDom = await page
      .locator("[class*='room'] h1, [class*='room'] h2, [class*='room'] h3, [class*='room'] h4, [class*='room'] strong")
      .evaluateAll((els) =>
        els.slice(0, 12).map((e) => ({
          tag: e.tagName,
          cls: e.className?.toString().slice(0, 80),
          parentCls: e.parentElement?.className?.toString().slice(0, 80),
          text: (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
        })),
      );
    console.log("room title candidates:", JSON.stringify(cardDom, null, 2));

    // Open the property selector: click the panel row showing the current property
    try {
      await page.getByText("롯데리조트 속초", { exact: false }).last().click({ timeout: 5_000 });
      await page.waitForTimeout(3_000);
      await dump(page, "property-modal");
      const options = await page
        .locator("a, button, li, label, [data-biz-cd], [data-bizcd]")
        .evaluateAll((els) =>
          els
            .map((e) => ({
              tag: e.tagName,
              text: (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60),
              attrs: Object.fromEntries(
                Array.from(e.attributes)
                  .filter(
                    (a) =>
                      a.name.startsWith("data-") ||
                      ["value", "href", "id", "class"].includes(a.name),
                  )
                  .map((a) => [a.name, a.value.slice(0, 100)]),
              ),
            }))
            .filter((o) => /롯데리조트|속초|부여|제주|김해|산정/.test(o.text) && o.text.length < 60),
        );
      console.log("property options:", JSON.stringify(options, null, 2));
    } catch (e) {
      console.log("property selector open failed:", e instanceof Error ? e.message : e);
    }
  } else if (step === "dom") {
    const apiCalls: string[] = [];
    page.on("response", (res) => {
      const ct = res.headers()["content-type"] ?? "";
      if (ct.includes("json") && !res.url().includes("google") && !res.url().includes("facebook")) {
        apiCalls.push(`${res.status()} ${res.request().method()} ${res.url().slice(0, 180)}`);
      }
    });
    const direct =
      "https://resort.lottehotel.com/main/ko/reservation/accommodation" +
      "?bizCd=81&checkinDt=20260801&checkoutDt=20260802&roomCnt=1&reservationType=BAR";
    await page.goto(direct, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(12_000);
    console.log("json api calls:\n" + apiCalls.join("\n"));

    // Walk up from a room-title text node to its card container and dump HTML
    const cardHtml = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const t = node.textContent?.trim() ?? "";
        if (/^호텔 디럭스|^콘도 디럭스/.test(t)) {
          let el = node.parentElement;
          for (let i = 0; i < 6 && el; i++) {
            if (el.className && /item|card|list|room/i.test(el.className.toString())) break;
            el = el.parentElement;
          }
          return {
            titleTag: node.parentElement?.tagName,
            titleCls: node.parentElement?.className?.toString(),
            containerCls: el?.className?.toString(),
            html: (el?.outerHTML ?? "").slice(0, 4000),
          };
        }
      }
      return null;
    });
    console.log("card structure:", JSON.stringify(cardHtml, null, 2));
  } else if (step === "lpoint") {
    await page.goto("https://www.lottehotel.com/global/ko/login/rewards", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(5_000);
    await acceptCookies(page);
    await page.getByText("L.POINT 로그인", { exact: false }).first().click({ timeout: 10_000 });
    await page.waitForTimeout(5_000);
    await dump(page, "lpoint");
    await dumpInputs(page);
    const buttons = await page.getByRole("button").allInnerTexts();
    console.log("buttons:", JSON.stringify(buttons.filter(Boolean).slice(0, 20)));
    // iframe? L.POINT SSO often embeds or redirects
    console.log("frames:", page.frames().map((f) => f.url().slice(0, 120)));
  } else if (step === "doLogin") {
    // Run the crawler's own performLogin while recording every request the
    // page makes, so we learn what a SUCCESSFUL login looks like on the wire.
    //
    // This exists because the production login fails silently: the overlay is
    // dismissed, the tab switches, the form fills, and then `isLogin` simply
    // stays false for 25s with nothing on the page to say why. Without a
    // reference recording of the working case there is nothing to diff against.
    const { performLogin, checkLoggedIn } = await import("../src/crawlers/lotte/login");
    const { prisma } = await import("../src/lib/prisma");
    const { decrypt } = await import("../src/lib/crypto");

    const resort = await prisma.resort.findUnique({ where: { slug: "LOTTE" } });
    const account = resort
      ? await prisma.resortAccount.findFirst({
          where: { resortId: resort.id, isPrimary: true },
          orderBy: { updatedAt: "desc" },
        })
      : null;
    if (!account) throw new Error("No primary LOTTE ResortAccount — add one at /admin/accounts");

    const noise = /google|facebook|doubleclick|kakao|naver|criteo|analytics|gtm|hotjar|clarity|adobe|wcs\.naver|\.(png|jpg|jpeg|gif|svg|woff2?|css|ico)(\?|$)/i;
    const calls: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "GET" || noise.test(req.url())) return;
      calls.push(`→ ${req.method()} ${req.url().slice(0, 160)}`);
    });
    page.on("response", async (res) => {
      const req = res.request();
      if (noise.test(res.url())) return;
      if (req.method() === "GET" && !/login|auth|member|sso|session/i.test(res.url())) return;
      let body = "";
      try {
        const ct = res.headers()["content-type"] ?? "";
        if (ct.includes("json") || ct.includes("text/plain")) {
          body = (await res.text()).replace(/\s+/g, " ").slice(0, 240);
        }
      } catch {
        /* body already consumed */
      }
      calls.push(`← ${res.status()} ${req.method()} ${res.url().slice(0, 160)}${body ? `\n    ${body}` : ""}`);
    });

    const ctx = {
      resortId: resort!.id,
      slug: "lotte",
      context,
      page,
      credentials: { id: decrypt(account.idEncrypted), pw: decrypt(account.pwEncrypted) },
      log: (msg: string, meta?: Record<string, unknown>) => console.log(msg, meta ?? ""),
      // 조사 스크립트에는 Vercel 60초 예산이 없다. 크롤러가 선택적 작업을
      // 포기하지 않도록 넉넉히 잡는다 — 여기서 재는 것은 시간이 아니라 동작이다.
      deadlineAt: Date.now() + 10 * 60_000,
    };
    try {
      await performLogin(ctx);
      console.log("\n=== LOGIN OK ===");
      // 성공 분기에서만, 그리고 `checkLoggedIn`으로 한 번 더 물어보고서 저장한다.
      // **실패한 로그인의 쿠키를 남기는 것이 여기서 가능한 최악의 결과다** — 이후
      // 모든 스텝이 익명 질문에 답하면서 "인증됐다"고 주장하게 되고, 그건 이 조사가
      // 없애려고 만들어진 바로 그 오답이다.
      if (await checkLoggedIn(ctx)) {
        saveState(await context.storageState(), "doLogin");
      } else {
        console.log("[state] not saved — performLogin returned but isLogin is false");
      }
    } catch (e) {
      console.log("\n=== LOGIN FAILED ===");
      console.log(e instanceof Error ? e.message.slice(0, 400) : String(e));
    }
    console.log("\n=== traffic (non-GET + auth-ish) ===");
    console.log(calls.join("\n"));
    console.log("\ncookies:", JSON.stringify(
      (await context.cookies()).map((c) => `${c.name}@${c.domain}`),
    ));
    await dump(page, "after-login");
  } else if (step === "keys") {
    // 금액 조사, Lotte. Runs first of the five because it is the only one that
    // costs no login at all: the `roomlist` step above already leans on the
    // room list API being public for BAR rates. Repeated logins against the
    // corporate accounts risk locking them, so the census order is "cheapest
    // login first", not "most curious first".
    const { LOTTE } = await import("../src/crawlers/lotte/config");
    const { formatDateCompact } = await import("../src/crawlers/lotte/format");
    const { parseDate, todayKstIso, addDaysUtc } = await import("../src/lib/utils");

    // Far enough out that rooms are still open, near enough to sit inside the
    // hot window the scheduler actually collects.
    const checkin = addDaysUtc(parseDate(todayKstIso()), 14);
    const bizCd = LOTTE.branches[0].bizCd;
    const stayUrl = (nights: number) =>
      `${LOTTE.bookingUrl}?bizCd=${bizCd}` +
      `&checkinDt=${formatDateCompact(checkin)}` +
      `&checkoutDt=${formatDateCompact(addDaysUtc(checkin, nights))}` +
      `&roomCnt=1&reservationType=BAR`;
    console.log(`branch: ${LOTTE.branches[0].label} (bizCd=${bizCd})`);
    console.log(`checkin: ${formatDateCompact(checkin)}`);

    // Q2 — is a rate on a *different* call? The room list is only one of the
    // JSON requests the booking page fires, and the crawler only ever looks at
    // that one. Anything else it loads is invisible to us today.
    const siblings: string[] = [];
    page.on("response", async (res) => {
      const ct = res.headers()["content-type"] ?? "";
      if (!ct.includes("json")) return;
      if (/google|facebook|doubleclick|analytics|adobe|criteo|kakao/.test(res.url())) return;
      let bytes = -1;
      try {
        bytes = (await res.body()).byteLength;
      } catch {
        // Body already discarded — the URL is still the useful half.
      }
      siblings.push(
        `${res.status()} ${res.request().method()} ${String(bytes).padStart(8)}B  ${res.url().slice(0, 200)}`,
      );
    });
    await page.goto(stayUrl(1), { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(12_000);
    await acceptCookies(page);
    await page.waitForTimeout(5_000);
    console.log("\n=== sibling JSON responses (Q2) ===");
    console.log(siblings.length ? siblings.join("\n") : "  (none)");

    // Q1/Q3 — the same room asked three stay lengths. The hypothesis to
    // disprove is "per-night": SONO/RESOM/OAKVALLEY/HANWHA all ignore the stay
    // length entirely (measured, see their config comments), so a number that
    // does not move is per-night and we would have to sum it ourselves.
    // Believing the opposite is how the 2박 bug of 2026-08-09 happened.
    const byNights = new Map<number, Array<Record<string, unknown>>>();
    for (const nights of [1, 2, 3]) {
      const res = await page.request.get(LOTTE.roomListApiUrl, {
        params: {
          rsvType: "BAR",
          procType: "",
          bizCd,
          checkinDt: formatDateCompact(checkin),
          checkoutDt: formatDateCompact(addDaysUtc(checkin, nights)),
          roomCnt: "1",
        },
        headers: { Accept: "application/json", Referer: `${LOTTE.bookingUrl}?bizCd=${bizCd}` },
        timeout: LOTTE.timeouts.api,
      });
      const payload = (await res.json()) as Record<string, unknown>;
      const rooms = (payload.roomList ?? []) as Array<Record<string, unknown>>;
      byNights.set(nights, rooms);
      console.log(`\nnights=${nights}: HTTP ${res.status()}, ${rooms.length} rooms`);
      if (nights === 1) {
        envelopeKeys("roomList response", payload);
        keyCensus("roomList[] — 1박", rooms);
      }
    }

    const one = byNights.get(1) ?? [];
    const probe = one[0];
    console.log("\n=== numeric keys across 1 / 2 / 3 nights (Q3) ===");
    if (!probe) {
      console.log("  (no rooms returned — pick another date and re-run)");
    } else {
      const numericKeys = [
        ...new Set(
          one.flatMap((r) =>
            Object.entries(r)
              .filter(([, v]) => asNumber(v) !== null)
              .map(([k]) => k),
          ),
        ),
      ];
      console.log(`  probe room: ${String(probe.roomNm)}`);
      for (const key of numericKeys) {
        const cells = [1, 2, 3].map((n) => {
          const room = (byNights.get(n) ?? []).find((r) => r.roomNm === probe.roomNm);
          return `${n}박=${room ? String(room[key]) : "-"}`;
        });
        console.log(`  ${key}: ${cells.join("  ")}`);
      }
    }

    // Q6 — `parse.ts:44-47` keeps one row per `roomNm` and drops the rest. If
    // two entries share a name and disagree on a number, this resort's rows
    // cannot carry one exact amount either, and a rate would have to be folded
    // (minimum, labelled "부터") rather than picked arbitrarily.
    console.log("\n=== entries sharing a roomNm (Q6) ===");
    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const r of one) {
      const name = String(r.roomNm ?? "");
      groups.set(name, [...(groups.get(name) ?? []), r]);
    }
    const collided = [...groups.entries()].filter(([, rows]) => rows.length > 1);
    for (const [name, rows] of collided) {
      console.log(`  ${name} — ${rows.length} entries`);
      console.log(`    ${JSON.stringify(rows).slice(0, 600)}`);
    }
    console.log(`  ${collided.length} of ${groups.size} names carry more than one entry`);
  } else if (step === "member") {
    // 회원가 조사. `keys`("이 응답에 무엇이 있나")와 질문이 다르다 —
    // **"신원이 이 API의 답을 바꾸는가."** 그래서 나머지 입력은 일부러 전부 고정한다.
    //
    // 이 스텝이 존재하는 이유는 측정 공백 하나다. 롯데 요금·정원 조사는 **전부
    // 비로그인으로** 이뤄졌다 — `keys`가 자기 주석에 그렇게 적어 두었고("로그인이
    // 필요 없다(BAR는 공개다)"), `AGENTS.md`의 정원 표도 "비로그인 BAR 호출"이라고
    // 명시한다. `memberType`이 전 객실 `""`라는 근거도 거기서 나왔다. 그런데
    // 운영자는 사이트에 로그인하면 **객실 목록 단계에서 이미** 다른 금액이 보인다고
    // 한다. 둘 중 하나는 틀렸고, 아무도 물어본 적이 없다.
    //
    // 계보: 오크밸리 `probe`("성공한 응답이 옳은 응답은 아니다") → 소노 `flow`
    // ("우리가 읽는 응답이 그 화면의 전부는 아니다") → 한화 `cal`("우리 요청이
    // 성공했다"가 "사이트와 같은 질문을 했다"의 증거가 되지 못한다). 이 스텝은 그
    // 셋을 신원이라는 한 축에 대고 다시 묻는다.
    const { LOTTE } = await import("../src/crawlers/lotte/config");
    const { formatDateCompact } = await import("../src/crawlers/lotte/format");
    const { parseDate, todayKstIso, addDaysUtc } = await import("../src/lib/utils");

    // `keys`와 같은 창. 방이 남아 있을 만큼 멀고, 스케줄러가 실제로 모으는 핫 윈도우
    // 안에 드는 거리다. 0행인 날짜를 잡으면 census가 아무것도 증명하지 못한다.
    const checkin = addDaysUtc(parseDate(todayKstIso()), 14);
    const checkinDt = formatDateCompact(checkin);
    const checkoutDt = formatDateCompact(addDaysUtc(checkin, 1));

    type Room = Record<string, unknown>;
    const baseParams = (bizCd: string): Record<string, string> => ({
      rsvType: "BAR",
      procType: "",
      bizCd,
      checkinDt,
      checkoutDt,
      roomCnt: "1",
    });
    const fetchRooms = async (
      p: Page,
      bizCd: string,
      overrides: Record<string, string> = {},
    ): Promise<{ status: number; rsltCd: string; rooms: Room[]; payload: unknown }> => {
      const res = await p.request.get(LOTTE.roomListApiUrl, {
        params: { ...baseParams(bizCd), ...overrides },
        headers: { Accept: "application/json", Referer: `${LOTTE.bookingUrl}?bizCd=${bizCd}` },
        timeout: LOTTE.timeouts.api,
      });
      let payload: Record<string, unknown> = {};
      try {
        payload = (await res.json()) as Record<string, unknown>;
      } catch {
        // 비JSON(챌린지 페이지 등)도 판정에 쓸 수 있다 — 상태 코드가 남는다.
      }
      return {
        status: res.status(),
        rsltCd: String(payload.rsltCd ?? "-"),
        rooms: (payload.roomList ?? []) as Room[],
        payload,
      };
    };
    const verdict: string[] = [];

    // ── Q0 — 질문이 아니라 나머지 질문의 전제다 ─────────────────────────────
    //
    // 세션이 없는데 Q2를 돌리면 익명↔익명 대조가 나오고, 그 출력은 글자 하나 다르지
    // 않게 **"로그인은 아무 차이도 만들지 않는다"**로 읽힌다. 이 조사가 낼 수 있는
    // 최악의 오답이라 맨 앞에서 막는다.
    let authed = false;
    try {
      const probe = await page.request.get(LOTTE.isLoginUrl, {
        headers: { Accept: "application/json" },
        timeout: LOTTE.timeouts.api,
      });
      authed = ((await probe.json()) as { data?: boolean })?.data === true;
    } catch {
      // 못 물어본 것은 "인증됐다"가 아니다.
    }
    console.log(`\nisLogin=${authed}  checkin=${checkinDt} checkout=${checkoutDt}`);
    // 캐시 세션 TTL은 6시간이다(`LOTTE.sessionTtlHours`). 그보다 늙은 파일은 인증된
    // 척하는 익명 컨텍스트이고, 그 사실이 응답에는 안 적혀 있다.
    if (stateAgeMin != null && stateAgeMin > LOTTE.sessionTtlHours * 60) {
      console.log(`  ⚠️ 저장 세션이 TTL(${LOTTE.sessionTtlHours}h)보다 늙었다 — age=${stateAgeMin}m`);
    }
    if (!authed) console.log("  ⚠️ 세션 없음 — `npx tsx scripts/debug-page.ts doLogin` 먼저");

    // ── Q1 (익명, 로그인 비용 0) — 익명 응답에 이미 회원 트랙이 있나 ─────────
    //
    // **바깥 컨텍스트를 쓰지 않는다.** STATE_FILE이 생긴 뒤로 이 스크립트의 "익명"은
    // 스텝마다 다르고, 여기서 익명은 방금 만든 빈 컨텍스트여야 한다.
    const anonCtx = await newContextFromState(browser, null);
    const anonPage = await anonCtx.newPage();
    const probeBranch = LOTTE.branches[0];
    console.log(`\n=== Q1 — 익명 응답 전수 (${probeBranch.label}, bizCd=${probeBranch.bizCd}) ===`);
    const q1 = await fetchRooms(anonPage, probeBranch.bizCd);
    console.log(`HTTP ${q1.status} rsltCd=${q1.rsltCd} rooms=${q1.rooms.length}`);
    envelopeKeys("roomList response (anon)", q1.payload);
    keyCensus("roomList[] — anon", q1.rooms);
    spotlight(q1.rooms, [
      "memberType",
      "roomAvgAmt",
      "minRateAmt",
      "earlybirdRateAmt",
      "pointAmt",
    ]);
    reportMoney("roomList[] — anon", q1.rooms);
    reportIdentity("roomList[] — anon", q1.rooms);
    verdict.push(
      `Q1 익명 memberType : ${
        q1.rooms.length
          ? valueAlphabet(q1.rooms.map((r) => r.memberType))
          : "(0행 — 아무것도 증명 못 함)"
      }`,
    );

    // ── Q2 — 같은 6개 파라미터, 인증 vs 익명 ────────────────────────────────
    //
    // 한화 `keys`의 Q4(회원 뷰 01 ↔ 일반 뷰 02 대조)와 같은 모양이다. 두 반쪽을
    // **연달아** 받는다 — Q1의 응답을 재사용하면 수십 초 간격의 시간 차이가 신원
    // 차이로 섞여 들어온다.
    console.log("\n=== Q2 — 같은 요청, 인증 vs 익명 ===");
    if (!authed) {
      console.log("  (측정 못 함 — 세션이 없다. 익명↔익명 대조는 답이 아니라 오답이다)");
      verdict.push("Q2 인증 vs 익명    : 측정 못 함 (세션 없음)");
    } else {
      let diffRowsTotal = 0;
      let sharedTotal = 0;
      let setDiffTotal = 0;
      for (const branch of LOTTE.branches) {
        const a = await fetchRooms(anonPage, branch.bizCd);
        const b = await fetchRooms(page, branch.bizCd);
        const anonBy = new Map(a.rooms.map((r) => [String(r.roomNm ?? ""), r]));
        const authBy = new Map(b.rooms.map((r) => [String(r.roomNm ?? ""), r]));
        const shared = [...authBy.keys()].filter((k) => anonBy.has(k));
        const onlyAuth = [...authBy.keys()].filter((k) => !anonBy.has(k));
        const onlyAnon = [...anonBy.keys()].filter((k) => !authBy.has(k));
        sharedTotal += shared.length;
        setDiffTotal += onlyAuth.length + onlyAnon.length;
        console.log(
          `\n  ${branch.label}: anon ${a.rooms.length}행 / auth ${b.rooms.length}행 · ` +
            `공통 ${shared.length} · auth에만 ${onlyAuth.length} · anon에만 ${onlyAnon.length}`,
        );
        // 회원 전용 재고가 있다면 여기 말고는 나타날 곳이 없다.
        if (onlyAuth.length) console.log(`    auth에만: ${JSON.stringify(onlyAuth).slice(0, 240)}`);
        if (onlyAnon.length) console.log(`    anon에만: ${JSON.stringify(onlyAnon).slice(0, 240)}`);

        const diffKeys = new Map<string, string[]>();
        for (const name of shared) {
          const ra = anonBy.get(name)!;
          const rb = authBy.get(name)!;
          for (const k of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
            // `id`는 응답마다 새로 발급되는 UUID라 **두 번 부르면 언제나 다르다.**
            // 세지 않고 거른다 — 첫 실행에서 이것 하나가 71행 전부를 "다름"으로
            // 만들어 판정을 뒤집었다. 신원 때문이 아니라 두 번 물어봤기 때문이다.
            if (VOLATILE_KEYS.has(k)) continue;
            if (JSON.stringify(ra[k]) === JSON.stringify(rb[k])) continue;
            const na = asNumber(ra[k]);
            const nb = asNumber(rb[k]);
            const delta =
              na != null && nb != null && na !== 0
                ? `  Δ=${nb - na} (${(((nb - na) / na) * 100).toFixed(1)}%)`
                : "";
            diffKeys.set(k, [
              ...(diffKeys.get(k) ?? []),
              `${name}: anon=${JSON.stringify(ra[k])} auth=${JSON.stringify(rb[k])}${delta}`,
            ]);
          }
        }
        if (!diffKeys.size) {
          console.log("    다른 키 없음 — 두 응답이 키 단위로 동일하다");
        } else {
          // 49키 × 71객실을 다 찍으면 로그가 되고, **다른 것만** 찍으면 판정이 된다.
          for (const [k, lines] of [...diffKeys.entries()].sort((x, y) => y[1].length - x[1].length)) {
            diffRowsTotal += lines.length;
            console.log(`    ${k}: ${lines.length}/${shared.length} 행이 다름`);
            for (const line of lines.slice(0, 5)) console.log(`      ${line}`);
            if (lines.length > 5) console.log(`      … +${lines.length - 5}행`);
          }
        }
      }
      verdict.push(
        `Q2 인증 vs 익명    : 공통 ${sharedTotal}행 중 다른 셀 ${diffRowsTotal}개 · 객실집합 차이 ${setDiffTotal}개` +
          (diffRowsTotal === 0 && setDiffTotal === 0
            ? "  → 세션은 이 요청의 답을 바꾸지 않는다"
            : "  → 세션이 답을 바꾼다"),
      );
    }

    // ── Q3 — 로그인한 예약 화면은 스스로 무엇을 묻는가 ──────────────────────
    //
    // 위 예측("쿠키가 아니라 요청이 다르다")이 맞다면 답은 여기에 있다.
    //
    // ⚠️ 딥링크로 들어간다는 점을 먼저 인정해 둔다. 실제 예약 URL에는 `id=` 토큰이
    // 붙고(`bizcds` 스텝의 주석), 토큰 없이 들어간 화면이 회원 흐름을 안 탈 수 있다.
    // 그러면 결과가 "회원 콜이 없다"로 **잘못** 읽히므로, 사람이 직접 몰 수 있는
    // 탈출구를 둔다: CRAWLER_HEADLESS=false LOTTE_FLOW_MANUAL=1 NET_WAIT_MS=180000
    console.log("\n=== Q3 — 사이트 자신의 요청 ===");
    // ⚠️ **원본 URL을 그대로 들고 있는다.** 처음 구현은 여기서 바로 `redactQuery`를
    // 걸었고, 그 결과 아래 Q3b가 `memberNo=<10 digits>`라는 **가짜 값**을 재생하면서
    // "파라미터는 답을 바꾸지 않는다"는 결론을 냈다. 가림은 **출력 시점**의 일이지
    // 수집 시점의 일이 아니다 — 재생할 요청까지 가려 버리면 그 실험이 무효가 된다.
    const sawRoomList: Array<{ tag: string; url: string }> = [];
    const sawJson: string[] = [];
    const attachRecorders = (p: Page, tag: string) => {
      p.on("request", (req) => {
        if (!req.url().includes("/reservation/roomList")) return;
        sawRoomList.push({ tag, url: req.url() });
      });
      p.on("response", async (res) => {
        if (!(res.headers()["content-type"] ?? "").includes("json")) return;
        if (/google|facebook|doubleclick|analytics|adobe|criteo|kakao|naver/i.test(res.url())) return;
        let bytes = -1;
        try {
          bytes = (await res.body()).byteLength;
        } catch {
          // 본문이 이미 사라졌다 — URL이 여전히 쓸모 있는 절반이다.
        }
        sawJson.push(
          `[${tag}] ${res.status()} ${res.request().method()} ${String(bytes).padStart(7)}B  ${redactQuery(res.url())}`,
        );
      });
    };
    attachRecorders(page, "auth");
    // 익명으로도 같은 화면을 녹화한다. 그래야 "로그인한 화면이 memberNo를 보낸다"와
    // "그 화면은 로그인하든 말든 memberNo를 보낸다"가 구별된다.
    attachRecorders(anonPage, "anon");

    const bookingUrl =
      `${LOTTE.bookingUrl}?bizCd=${probeBranch.bizCd}` +
      `&checkinDt=${checkinDt}&checkoutDt=${checkoutDt}&roomCnt=1&reservationType=BAR`;
    const manual = process.env.LOTTE_FLOW_MANUAL === "1";
    const waitMs = Number(process.env.NET_WAIT_MS) || (manual ? 180_000 : 15_000);
    for (const [p, tag] of [
      [page, "auth"],
      [anonPage, "anon"],
    ] as const) {
      if (tag === "auth" || !manual) {
        await p.goto(bookingUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await acceptCookies(p);
        await p.waitForTimeout(tag === "auth" ? waitMs : 12_000);
      }
    }

    console.log("\n  roomList 요청 (사이트가 쏜 것):");
    console.log(
      sawRoomList.length
        ? sawRoomList.map((r) => `    [${r.tag}] ${redactQuery(r.url)}`).join("\n")
        : "    (없음)",
    );
    console.log("\n  형제 JSON:");
    console.log(sawJson.length ? sawJson.map((l) => `    ${l}`).join("\n") : "    (없음)");

    // 파라미터 단위 대조 — 한화 `cal`이 하는 그대로. "우리 요청이 성공했다"가
    // "사이트와 같은 질문을 했다"의 증거가 되지 못하므로, 필드별로 세운다.
    const theirAuth = sawRoomList.find((r) => r.tag === "auth")?.url;
    const theirAnon = sawRoomList.find((r) => r.tag === "anon")?.url;
    const showVal = (k: string, v: string | null) =>
      v == null ? "-" : IDENTITY_KEY.test(k) && /^\d{6,}$/.test(v) ? `<${v.length} digits>` : JSON.stringify(v);
    if (theirAuth) {
      console.log("\n  파라미터 대조 (site ↔ ours):");
      const theirs = new URL(theirAuth).searchParams;
      const anonTheirs = theirAnon ? new URL(theirAnon).searchParams : null;
      const ours = new URLSearchParams(baseParams(probeBranch.bizCd));
      for (const k of [...new Set([...theirs.keys(), ...ours.keys()])].sort()) {
        const t = theirs.get(k);
        const o = ours.get(k);
        const how = t == null ? "only ours" : o == null ? "ONLY THEIRS" : t === o ? "same" : "DIFFERING";
        // 사이트가 로그인 여부에 따라 **다르게 채우는** 칸이 이 조사의 표적이다.
        const a = anonTheirs?.get(k) ?? null;
        const identityAxis = anonTheirs && a !== t ? "  ← 로그인하면 달라지는 칸" : "";
        console.log(
          `    ${k.padEnd(16)} site=${showVal(k, t)}  ours=${showVal(k, o)}  ${how}` +
            (identityAxis ? `${identityAxis} (anon=${showVal(k, a)})` : ""),
        );
      }
    } else {
      console.log("\n  ⚠️ 사이트가 쏜 roomList를 못 봤다 — 이것은 '없다'가 아니라 '못 봤다'다.");
      console.log("     CRAWLER_HEADLESS=false LOTTE_FLOW_MANUAL=1 NET_WAIT_MS=180000 으로 직접 몰 것.");
    }

    // ── Q3b — 사이트의 **전체 파라미터**를 그대로 재생해 본다 ────────────────
    //
    // Q3의 대조표가 "ONLY THEIRS"를 15개나 냈다. 그중 값이 있는 둘
    // (`membYearUseDaysType=1` · `ownType=1`)은 이름부터 회원 축이다. 그렇다면
    // 질문이 하나 갈라진다 — **신원이 부족한 건가, 파라미터가 부족한 건가.**
    // 같은 세션으로 6개짜리와 21개짜리를 나란히 쏴 보면 그 둘이 분리된다.
    const shapeOf = (rooms: Room[]) =>
      JSON.stringify(rooms.map((x) => [x.roomNm, x.roomAvgAmt, x.roomCnt, x.memberType]).sort());
    if (theirAuth) {
      console.log("\n=== Q3b — 사이트의 전체 파라미터를 그대로 재생 ===");
      const theirs = new URL(theirAuth).searchParams;
      const full: Record<string, string> = {};
      for (const [k, v] of theirs.entries()) full[k] = v;
      for (const [p, tag] of [
        [page, authed ? "auth" : "auth(세션없음)"],
        [anonPage, "anon"],
      ] as const) {
        const mine = await fetchRooms(p, probeBranch.bizCd);
        const site = await fetchRooms(p, probeBranch.bizCd, full);
        console.log(
          `  ${tag}: ours(6) ${mine.rooms.length}행 / site(${theirs.size}) ${site.rooms.length}행 — ` +
            (shapeOf(mine.rooms) === shapeOf(site.rooms)
              ? "동일 (빠진 파라미터는 답을 바꾸지 않는다)"
              : "**다름** — 파라미터가 답을 바꾼다"),
        );
      }
    }

    // ── Q3c — 로그인해야만 달라지는 칸 둘, 그리고 로그인해야만 부르는 콜 하나 ──
    //
    // Q3의 대조에서 로그인 여부로 값이 갈린 칸은 정확히 둘이다(`memberNo`·`ownType`).
    // 그리고 로그인한 화면만 부르는 엔드포인트가 하나 더 있다 — `fullMemberInform`.
    // 회원가로 가는 문이 이 API 쪽에 있다면 셋 중 하나다. 하나씩 넣어 본다.
    if (theirAuth && authed) {
      console.log("\n=== Q3c — memberNo · ownType · fullMemberInform ===");
      const theirs = new URL(theirAuth).searchParams;
      const memberNo = theirs.get("memberNo") ?? "";
      const siteOwnType = theirs.get("ownType") ?? "";
      const anonOwnType = theirAnon ? (new URL(theirAnon).searchParams.get("ownType") ?? "") : "?";
      console.log(
        `  memberNo=${showVal("memberNo", memberNo)}  ownType=${JSON.stringify(siteOwnType)}` +
          `  (anon일 때 ownType=${JSON.stringify(anonOwnType)})`,
      );

      const inform = await page.request.get(
        `${new URL(LOTTE.roomListApiUrl).origin}/api/main/ko/reservation/fullMemberInform`,
        {
          params: { bizCd: probeBranch.bizCd, memberNo, exclusiveCd: "" },
          headers: { Accept: "application/json" },
          timeout: LOTTE.timeouts.api,
        },
      );
      let informBody: unknown = null;
      try {
        informBody = await inform.json();
      } catch {
        // 비JSON이면 상태 코드만으로도 판정에 쓸 수 있다.
      }
      console.log(`  fullMemberInform: HTTP ${inform.status()}`);
      envelopeKeys("fullMemberInform", informBody);
      reportMoney("fullMemberInform", informBody);

      // 무엇이 답을 움직이는가. 한 번에 하나씩 — 오크밸리 `probe`가 가르친 방식이다.
      const base = await fetchRooms(page, probeBranch.bizCd);
      const trials: Array<[string, Record<string, string>]> = [
        ["+memberNo", { memberNo }],
        ["+ownType(site)", { ownType: siteOwnType }],
        ["+memberNo+ownType", { memberNo, ownType: siteOwnType }],
        ["site 전체", Object.fromEntries(theirs.entries())],
      ];
      for (const [label, extra] of trials) {
        const r = await fetchRooms(page, probeBranch.bizCd, extra);
        console.log(
          `  ${label.padEnd(20)} HTTP ${r.status} ${String(r.rooms.length).padStart(3)}행  ` +
            (shapeOf(r.rooms) === shapeOf(base.rooms) ? "BAR 기준선과 동일" : "**다름**"),
        );
      }

      // ── Q3d — 회원 트랙 응답을 전수로 본다 ─────────────────────────────
      //
      // 여기까지가 "다르다"이고, 여기부터가 **"무엇이 다른가"**다. 다르다는 것만으로
      // 붙일 수는 없다 — 어느 칸이 회원 요금이고 그 값이 우리 계약과 어떻게 이어지는지는
      // 아직 아무도 모른다.
      console.log("\n=== Q3d — 회원 트랙(memberNo+ownType) 응답 전수 ===");
      const member = await fetchRooms(page, probeBranch.bizCd, Object.fromEntries(theirs.entries()));
      keyCensus("roomList[] — member", member.rooms);
      spotlight(member.rooms, [
        "memberType",
        "roomAvgAmt",
        "minRateAmt",
        "earlybirdRateAmt",
        "roomCnt",
        "availableRsvType",
        "roomAmtType",
      ]);
      reportMoney("roomList[] — member", member.rooms);

      // ── Q3e — 크롤러가 그 둘을 **스스로** 알아낼 수 있는가 ─────────────
      //
      // 붙일 수 있느냐는 "요청이 무엇인가"가 아니라 **"그 요청을 우리가 만들 수
      // 있는가"**로 갈린다. `memberNo`·`ownType`은 계정마다 다르므로 config에 박으면
      // 안 된다 — 소노 `memNo`, 한화 `sCustNo`와 같은 규칙이고, 박는 순간 다른 계정으로
      // 갈아끼웠을 때 증상이 에러가 아니라 **남의 회원 요금**이 된다.
      const origin = new URL(LOTTE.roomListApiUrl).origin;
      const who = await page.request.get(`${origin}/common/login/user`, {
        headers: { Accept: "application/json" },
        timeout: LOTTE.timeouts.api,
      });
      console.log(`\n  /common/login/user: HTTP ${who.status()}`);
      let whoBody: unknown = null;
      try {
        whoBody = await who.json();
      } catch {
        // 비JSON이면 아래 탐색이 아무것도 못 찾고, 그 자체가 답이다.
      }
      // 값을 찍지 않는다 — 여기서 찾는 것은 **어느 칸에 있느냐**이지 그 값이 아니다.
      const found: string[] = [];
      const walk = (v: unknown, path: string, depth: number) => {
        if (depth > 4 || v === null) return;
        if (typeof v === "object") {
          for (const [k, vv] of Object.entries(v as Record<string, unknown>)) {
            walk(vv, path ? `${path}.${k}` : k, depth + 1);
          }
          return;
        }
        const str = String(v);
        if (str === memberNo && memberNo !== "") found.push(`${path} = memberNo(<${str.length} digits>)`);
        else if (str === siteOwnType && siteOwnType !== "" && /own|type|grad|memb/i.test(path))
          found.push(`${path} = ${JSON.stringify(str)} (ownType 후보)`);
      };
      walk(whoBody, "", 0);
      console.log(
        found.length
          ? `  세션에서 읽을 수 있는 자리:\n${found.map((f) => `    ${f}`).join("\n")}`
          : "  ⚠️ 이 응답에서 memberNo/ownType과 같은 값을 못 찾았다 — 다른 출처를 찾아야 한다",
      );

      // `resortList`라는 이름이 곧 질문이다 — **회원 자격이 지점마다 다른가.**
      // 다르다면 크롤러는 지점마다 다른 번호를 실어야 하고, 그건 배선이 한 겹 더 깊다.
      const resortList = (whoBody as { data?: { resortList?: Array<Record<string, unknown>> } })
        ?.data?.resortList;
      if (Array.isArray(resortList)) {
        // **화이트리스트다.** 처음엔 "신원처럼 보이는 칸만 가리고 나머지는 찍는다"로
        // 짰는데, 그 응답에는 회원사명·담당자명·휴대폰·이메일이 평문으로 들어 있어서
        // 그대로 터미널에 찍혔다. `login.ts:150-165`가 길이 제한이 아니라 화이트리스트를
        // 쓰는 이유가 정확히 이것이다 — **가릴 것을 열거하면 언젠가 하나를 빠뜨리고,
        // 빠뜨린 것이 무엇인지는 사고가 난 뒤에야 안다.** 여기서 필요한 것은 구조뿐이다.
        const STRUCTURAL = [
          "bizCd",
          "primaryYn",
          "memType",
          "guestType",
          "webMemCd",
          "memberGrpCd",
          "purchaseCd",
          "roomType",
          "roomSize",
          "familySeq",
          "mainMemberCnt",
        ];
        console.log(`  resortList: ${resortList.length}개 엔트리 (구조 필드만)`);
        for (const entry of resortList.slice(0, 6)) {
          const shown = STRUCTURAL.filter((k) => entry[k] !== undefined && entry[k] !== null).map(
            (k) => `${k}=${JSON.stringify(entry[k])}`,
          );
          console.log(`    ${shown.join(" ")} memberNo=${redactValue(entry.memberNo)}`);
        }
      }

      // 그리고 실제로 네 지점 전부에 같은 번호가 먹히는가. 먹히면 배선은 한 줄이다.
      console.log("\n  네 지점에 같은 memberNo·ownType을 실어 본다:");
      const coverage: string[] = [];
      for (const br of LOTTE.branches) {
        const bar = await fetchRooms(page, br.bizCd);
        const mem = await fetchRooms(page, br.bizCd, { memberNo, ownType: siteOwnType });
        const cheaper = mem.rooms.filter((r) => {
          const b = asNumber(bar.rooms.find((x) => x.roomNm === r.roomNm)?.roomAvgAmt);
          const m = asNumber(r.roomAvgAmt);
          return b != null && m != null && m < b;
        }).length;
        console.log(
          `    ${br.label.padEnd(4)} BAR ${String(bar.rooms.length).padStart(2)}행 / 회원 ${String(mem.rooms.length).padStart(2)}행` +
            `  · 더 싼 행 ${cheaper}/${mem.rooms.length}` +
            (mem.rooms.length < bar.rooms.length
              ? `  ⚠️ 회원 트랙에 ${bar.rooms.length - mem.rooms.length}행이 없다`
              : ""),
        );
        coverage.push(`${br.label} ${mem.rooms.length}/${bar.rooms.length}`);
      }
      // **회원 트랙이 BAR보다 행이 적을 수 있다**는 것이 이 표의 요점이다. 회원 요금이
      // 없는 객실은 목록에서 빠지므로, 회원 트랙 하나로 갈아타면 요금을 얻는 대신
      // 재고를 잃는다. 가용성과 요금의 출처를 같은 콜로 둘지가 여기서 갈린다.
      verdict.push(`Q3c 지점 커버리지   : 회원/BAR 행 ${coverage.join(" · ")}`);

      // ── Q3f — 회원 요금도 1박 평균인가 ─────────────────────────────────
      //
      // `parse.ts`의 `stayTotal`은 `roomAvgAmt × 박수`가 총액이라는 계약 위에 서 있다.
      // BAR에 대해서는 실측됐지만 **회원 트랙에 대해서는 아무도 재본 적이 없다.**
      // 여기서 안 재고 붙이면 2박이 절반으로 나가는 2026-08-09 소노 버그를 반복한다.
      // 세 길이에 **모두 살아 있는** 방을 고른다. 처음엔 1박 목록의 첫 방을 썼는데
      // 그 방이 2박 목록에 없어서 `null`이 나왔고, 그건 "회원 트랙은 2박을 안 준다"로
      // 읽혔다 — 실제로는 BAR도 같은 방을 안 준다(둘 다 12→6→4행). **없는 것과
      // 못 받는 것을 구별하지 못하는 표는 조사가 아니라 오해의 출처다.**
      const byNightsMember = new Map<number, Room[]>();
      const byNightsBar = new Map<number, Room[]>();
      for (const nights of [1, 2, 3]) {
        const co = formatDateCompact(addDaysUtc(checkin, nights));
        byNightsMember.set(
          nights,
          (await fetchRooms(page, probeBranch.bizCd, {
            ...Object.fromEntries(theirs.entries()),
            checkoutDt: co,
          })).rooms,
        );
        byNightsBar.set(nights, (await fetchRooms(page, probeBranch.bizCd, { checkoutDt: co })).rooms);
      }
      const common = (byNightsMember.get(1) ?? [])
        .map((r) => String(r.roomNm ?? ""))
        .filter((n) => [2, 3].every((k) => (byNightsMember.get(k) ?? []).some((r) => r.roomNm === n)));
      console.log(
        `\n  회원 트랙 1·2·3박 — 세 길이에 모두 있는 방 ${common.length}개 중 첫 방으로 본다:`,
      );
      const pick = common[0] ?? String(byNightsMember.get(1)?.[0]?.roomNm ?? "");
      for (const nights of [1, 2, 3]) {
        const mem = { rooms: byNightsMember.get(nights) ?? [] };
        const bar = { rooms: byNightsBar.get(nights) ?? [] };
        const mProbe = mem.rooms.find((x) => x.roomNm === pick);
        const bProbe = bar.rooms.find((x) => x.roomNm === pick);
        const avg = asNumber(mProbe?.roomAvgAmt);
        console.log(
          `    ${nights}박  회원 ${String(mem.rooms.length).padStart(2)}행 / BAR ${String(bar.rooms.length).padStart(2)}행` +
            `  · ${pick}: 회원=${JSON.stringify(mProbe?.roomAvgAmt ?? null)}` +
            (avg != null ? `(×${nights}=${avg * nights})` : "") +
            ` BAR=${JSON.stringify(bProbe?.roomAvgAmt ?? null)}`,
        );
      }
      console.log("\n  BAR ↔ 회원 트랙, 객실별:");
      const barBy = new Map(base.rooms.map((r) => [String(r.roomNm ?? ""), r]));
      const deltas: number[] = [];
      for (const room of member.rooms) {
        const name = String(room.roomNm ?? "");
        const bar = barBy.get(name);
        const b = asNumber(bar?.roomAvgAmt);
        const m = asNumber(room.roomAvgAmt);
        const pct = b != null && m != null && b !== 0 ? ((m - b) / b) * 100 : null;
        if (pct != null) deltas.push(pct);
        console.log(
          `    ${name.padEnd(26)} BAR=${bar ? JSON.stringify(bar.roomAvgAmt) : "-"}` +
            `  회원=${JSON.stringify(room.roomAvgAmt)}${pct == null ? "" : ` (${pct.toFixed(1)}%)`}` +
            `  memberType=${JSON.stringify(room.memberType)}  roomCnt=${JSON.stringify(room.roomCnt)}`,
        );
      }
      // 판정을 닫는 줄. **`memberType`은 여전히 `""`다** — 회원 트랙인데도 그렇다.
      // 즉 응답에는 "이건 회원가다"라고 말하는 칸이 없고, 라벨의 근거는 우리가 보낸
      // 요청뿐이다. 붙일 때 이 사실이 설계를 정한다.
      verdict.push(
        `Q3c 회원 축         : memberNo + ownType=${siteOwnType} → 요금 ${
          deltas.length
            ? `${Math.min(...deltas).toFixed(1)}~${Math.max(...deltas).toFixed(1)}%`
            : "(대조 불가)"
        } · memberType은 회원 트랙에서도 ${
          member.rooms.length ? valueAlphabet(member.rooms.map((r) => r.memberType)) : "-"
        }`,
      );
    }

    // 예약 유형 어휘. DOM 탭은 오늘 열린 것만 그리고 HTML에는 안 적혀 있다 —
    // 실측으로 확인했다(첫 실행에서 빈 배열). 번들이 유일한 출처다.
    const rsvTypes = new Set<string>(await page.evaluate(() => {
      const out = new Set<string>();
      const html = document.documentElement.innerHTML;
      for (const m of html.matchAll(/(?:reservationType|rsvType)=([A-Za-z0-9_]{1,16})/g)) out.add(m[1]);
      for (const m of html.matchAll(/["'](?:reservationType|rsvType)["']\s*:\s*["']([A-Za-z0-9_]{1,16})["']/g))
        out.add(m[1]);
      return [...out];
    }));
    // 번들에서도 캔다. 어휘가 코드에만 있고 화면에는 없는 것이 SPA의 기본값이다.
    const scriptUrls = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))
        .map((e) => e.src)
        .filter((u) => u.startsWith("http")),
    );
    for (const src of scriptUrls.slice(0, 40)) {
      try {
        const body = await (await page.request.get(src, { timeout: 10_000 })).text();
        for (const m of body.matchAll(/rsvType\s*[:=]\s*["']([A-Za-z0-9_]{2,16})["']/g)) rsvTypes.add(m[1]);
        for (const m of body.matchAll(/["']rsvType["']\s*:\s*["']([A-Za-z0-9_]{2,16})["']/g)) rsvTypes.add(m[1]);
      } catch {
        // 청크 하나를 못 받는 것은 어휘가 없다는 뜻이 아니다 — 조용히 넘어간다.
      }
    }
    const tabTexts = await page
      .locator("[role=tab], .tab a, .tab button, [class*=tab] a")
      .evaluateAll((els) =>
        els
          .map((e) => (e.textContent ?? "").trim().replace(/\s+/g, " "))
          .filter((t) => t && t.length < 30)
          .slice(0, 20),
      );
    console.log(`\n  reservationType/rsvType 어휘: ${JSON.stringify([...rsvTypes])}`);
    console.log(`  탭 텍스트: ${JSON.stringify(tabTexts)}`);
    verdict.push(
      `Q3 사이트 파라미터  : ${theirAuth ? "관측함" : "못 봄"} · rsvType 어휘 ${JSON.stringify([...rsvTypes])}`,
    );

    // ── Q4 — 다른 rsvType이 실제로 **먹히는가** ─────────────────────────────
    //
    // 수용 규칙을 표보다 **먼저** 찍는다. 오크밸리 `probe`가 가르친 함정이 여기서는
    // 이렇게 나타난다: 모르는 rsvType에 사이트가 200으로 BAR 목록을 그대로 돌려주면
    // "회원가와 공시가가 같다"는 틀린 결론이 나온다.
    console.log("\n=== Q4 — 대안 rsvType ===");
    const candidates = [...rsvTypes].filter((t) => t !== "BAR").slice(0, 8);
    if (!candidates.length) {
      console.log("  (건너뜀 — Q3가 후보를 대지 못했다. 값을 지어내면 200이 나오지 증거가 나오지 않는다)");
      verdict.push("Q4 대안 rsvType    : 건너뜀 (후보 없음)");
    } else {
      console.log("  수용 규칙: 같은 실행에서 받은 BAR 기준선과 **다를 때만** 반영된 것이다.");
      console.log("             객실 집합과 값이 BAR와 같으면 서버가 파라미터를 무시한 것이고,");
      console.log("             그때의 HTTP 200은 증거가 아니라 잡음이다.");
      const baseAuth = await fetchRooms(page, probeBranch.bizCd);
      const baseAnon = await fetchRooms(anonPage, probeBranch.bizCd);
      const shape = (r: { rooms: Room[] }) => shapeOf(r.rooms);
      const results: string[] = [];
      for (const cand of candidates) {
        const auth = await fetchRooms(page, probeBranch.bizCd, { rsvType: cand });
        const anon = await fetchRooms(anonPage, probeBranch.bizCd, { rsvType: cand });
        const verdictOf = (r: typeof auth, base: typeof auth) =>
          r.status !== 200 || !r.rooms.length
            ? `REJECTED (HTTP ${r.status} rsltCd=${r.rsltCd} rooms=${r.rooms.length})`
            : shape(r) === shape(base)
              ? `IGNORED (BAR와 동일 ${r.rooms.length}행)`
              : `DIFFERS (${r.rooms.length}행)`;
        const authVerdict = verdictOf(auth, baseAuth);
        console.log(`    ${cand.padEnd(10)} auth=${authVerdict}  anon=${verdictOf(anon, baseAnon)}`);
        // 판정 단어를 그대로 나른다. 0행을 "다르다"로 요약하면 거절이 발견으로 읽힌다.
        results.push(`${cand}=${authVerdict.split(" ")[0]}`);
      }
      // 익명에서도 달라지는 값은 회원가가 아니라 공개 프로모션(얼리버드·패키지)이다.
      console.log("  ⚠️ 익명에서도 BAR와 다른 값은 회원 트랙이 아니라 공개 프로모션이다.");
      verdict.push(`Q4 대안 rsvType    : ${results.join(" ")}`);
    }

    console.log("\n=== VERDICT ===");
    for (const line of verdict) console.log(`  ${line}`);
    console.log(
      "\n  경계: 실제 예약·결제 확정 단계는 몰지 않았다(실계정에 예약이 생긴다).\n" +
        "  거기에 요금이 있다 해도 이 저장소의 수집 대상이 아니다.",
    );
    await anonCtx.close();
  } else if (step === "roomlist") {
    // Exercise performSearch + parseRoomList without login (API is public for
    // BAR rates) — validates the post-login pipeline end-to-end.
    const { performSearch } = await import("../src/crawlers/lotte/search");
    const { parseDate, todayKstIso, addDaysUtc } = await import("../src/lib/utils");
    const checkin = parseDate(todayKstIso());
    const ctx = {
      resortId: "debug",
      slug: "lotte",
      context,
      page,
      credentials: { id: "", pw: "" },
      log: (msg: string, meta?: Record<string, unknown>) => console.log(msg, meta ?? ""),
      // 조사 스크립트에는 Vercel 60초 예산이 없다. 크롤러가 선택적 작업을
      // 포기하지 않도록 넉넉히 잡는다 — 여기서 재는 것은 시간이 아니라 동작이다.
      deadlineAt: Date.now() + 10 * 60_000,
    };
    const rows = await performSearch(ctx, { checkin, checkout: addDaysUtc(checkin, 1) });
    console.log(`rows: ${rows.length}`);
    console.log(JSON.stringify(rows.slice(0, 6), null, 2));
    const byBranch: Record<string, number> = {};
    for (const r of rows) byBranch[r.branchName] = (byBranch[r.branchName] ?? 0) + 1;
    console.log("per branch:", byBranch);
  } else {
    await page.goto(url ?? "https://www.lottehotel.com/global/ko", {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(6_000);
    await acceptCookies(page);
    await dump(page, "custom");
    await dumpInputs(page);
    const buttons = await page.getByRole("button").allInnerTexts();
    console.log("buttons:", JSON.stringify(buttons.filter(Boolean).slice(0, 40)));
    await dumpLinks(page, "main", "main");
  }

  await browser.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
