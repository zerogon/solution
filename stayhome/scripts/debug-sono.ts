import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { BrowserContext, Page, Request, Response } from "playwright-core";
import { launchBrowser, newContextFromState } from "../src/crawlers/_shared/browser";

/**
 * Site exploration helper for building the SONO crawler (Phase F).
 *
 * A deliberate copy of `scripts/debug-page.ts` rather than a generalization of
 * it: that file's steps (`lpoint`, `bizcds`, `roomlist`) are the narrative of
 * the Lotte investigation, not a reusable vocabulary, and it is the only tool
 * left for diagnosing a Lotte regression. Editing it mid-survey would trade
 * that away for nothing.
 *
 * Usage:
 *   CRAWLER_HEADLESS=false npx tsx scripts/debug-sono.ts <step> [url]
 *
 * Steps (in the order the survey wants them):
 *   main      entry point — header links, consent layer, reservation CTA
 *   login     login form — inputs, buttons, frames, aria snapshot
 *   doLogin   real login with SONO_ID/SONO_PW, then probe session markers
 *   net       record every JSON response while you drive a search by hand
 *             ← this step decides the JSON-API vs DOM branch
 *   branches  property selector — options, codes, regions
 *   rows      run sono/search.ts standalone (only after it exists)
 *   span      what one room-list call actually covers — the finding the
 *             scheduler's request count depends on
 *   keys      응답 키 전수 조사 — 요금(2026-08-24)·정원(08-31) 둘 다 여기서 판정했다
 *   flow      금액 조사 Q2 — drive PAST the availability calendar into room
 *             selection and record every JSON body. `keys` censused the one
 *             response we already read; this asks what else the flow calls.
 *   variants  변형 조사(2026-09-11) — 접힌 행이 무엇을 접고 있나. viewCd 어휘,
 *             rmTypeCd 정체, 2박 접기 오판 수, viewCd 이름표 출처, room/detail 재현.
 *             인자: 지점 value 쉼표 구분(기본 청송·비발디A·고양·제주).
 *   diff      compare site property list against SONO.branches
 *
 * Credentials: `SONO_ID`/`SONO_PW` env if set, otherwise the primary
 * ResortAccount from the DB — the same one `run.ts` will use, so the survey
 * exercises the real account rather than a lookalike.
 *
 * `doLogin` writes the authenticated storage state to `${OUT}-state.json` and
 * every other step reuses it when present. Logging in once per survey session
 * rather than once per step keeps us off the site's rate limiter.
 */
const OUT = process.env.DEBUG_OUT ?? "/tmp/sono-debug";
const STATE_FILE = `${OUT}-state.json`;

/** Entry points confirmed by the `main` step (2026-08-09). */
const SITE = {
  home: "https://www.sonohotelsresorts.com",
  login: process.env.SONO_LOGIN_URL ?? "https://www.sonohotelsresorts.com/member/login",
  /** Reservation flow entry — the booking widget lives inline on the home page. */
  booking: process.env.SONO_BOOKING_URL ?? "https://www.sonohotelsresorts.com",
};

/** Login form, discovered 2026-08-09: ids only, no `name`, no `<form>`. */
const LOGIN_SEL = { id: "#lginId", pw: "#lginPw" };

async function resolveCredentials(): Promise<{ id: string; pw: string }> {
  if (process.env.SONO_ID && process.env.SONO_PW) {
    return { id: process.env.SONO_ID, pw: process.env.SONO_PW };
  }
  const { prisma } = await import("../src/lib/prisma");
  const { decrypt } = await import("../src/lib/crypto");
  const resort = await prisma.resort.findUnique({ where: { slug: "SONO" } });
  if (!resort) throw new Error("SONO resort row missing — run npm run db:seed");
  const account = await prisma.resortAccount.findFirst({
    where: { resortId: resort.id, isPrimary: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!account) {
    throw new Error("No primary SONO ResortAccount. Add one at /admin/accounts, or set SONO_ID/SONO_PW.");
  }
  return { id: decrypt(account.idEncrypted), pw: decrypt(account.pwEncrypted) };
}

/**
 * Dismiss the promo layer and the cookie bar. `exact` matters: a substring
 * match on "동의" or "확인" also hits the "로그인 안내" dialog's 확인 button,
 * which navigates away mid-survey.
 */
async function dismissLayers(page: Page) {
  // "[동의]" is the reservation flow's own cookie bar — it sits bottom-right on
  // `/reserve/room` and the home page's list never had to name it.
  for (const name of ["닫기", "오늘 하루 그만보기", "전체 동의", "[동의]", "동의"]) {
    try {
      await page.getByRole("button", { name, exact: true }).first().click({ timeout: 2_000 });
      console.log(`[layer] closed "${name}"`);
      await page.waitForTimeout(600);
    } catch {
      /* absent */
    }
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
  console.log(
    "inputs:",
    JSON.stringify(inputs.filter((i) => i.type !== "hidden"), null, 2),
  );
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

async function dumpButtons(page: Page, limit = 40) {
  const buttons = await page.getByRole("button").allInnerTexts();
  console.log(
    "buttons:",
    JSON.stringify(
      buttons.map((b) => b.trim().replace(/\s+/g, " ")).filter(Boolean).slice(0, limit),
    ),
  );
}

/**
 * Attach a JSON-response recorder. Returns the accumulator so a step can print
 * it after driving the flow. This is the technique that found Lotte's roomList
 * (`debug-page.ts` step `dom`) and is the whole point of the `net` step.
 */
function recordJson(page: Page) {
  const calls: { line: string; url: string }[] = [];
  const noise = /google|facebook|doubleclick|kakao|naver|criteo|analytics|gtm|hotjar|clarity/i;
  page.on("response", (res: Response) => {
    const url = res.url();
    if (noise.test(url)) return;
    const ct = res.headers()["content-type"] ?? "";
    if (!ct.includes("json")) return;
    calls.push({
      line: `${res.status()} ${res.request().method()} ${url.slice(0, 220)}`,
      url,
    });
  });
  return calls;
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

// ─── 금액 조사 Q2 (2026-08-25): 재고 화면 **너머** ────────────────────────
//
// 2026-08-24의 판정("소노는 요금이 없다")이 실제로 근거한 것은 `room/list/pc`
// **한 응답**의 키 15개다. 그건 Q1의 답이고, Q2 — *그 화면이 부르는 다른 콜* —
// 는 이 사이트에 물어본 적이 없다. 오크밸리는 `entitys2`와 다른 서블릿까지,
// 한화는 게이트웨이 INTF_ID 전수까지 물었지만 소노는 거기서 멈췄다.
//
// 그 빈칸이 사소하지 않은 이유: **리솜이 정확히 이 자리에서 뒤집혔다.** 달력
// 응답의 `rmAmt`는 506행 전부 `"0"`이었는데, SPA가 *객실을 클릭할 때* 부르는
// 별도 콜(`roomReservation/stockPrice`)에 진짜 회원가가 있었다. 재고 응답만
// 봤다면 리솜도 "요금 없음"으로 닫혔을 것이다.
//
// 그래서 이 도구는 검색 결과에서 멈추지 않는다. 기존 스텝들이 반쪽씩 하던 것을
// 합치되 한 걸음 더 간다:
//   `net`      — 수동 기록. 하지만 URL 줄만 남기고 본문을 안 남긴다.
//   `doSearch` — 본문도 남기지만 `wanted` 정규식이 **미리 아는 이름만** 잡는다.
//                요금 콜의 이름을 모르는 지금 그 필터가 곧 사각지대다.
//   `keys`     — 한 응답의 키 전수. 다른 콜은 안 본다.

/** 한 JSON 왕복. 요청 본문과 지연까지 — 비용이 이 조사의 절반이다. */
interface Capture {
  phase: string;
  method: string;
  url: string;
  status: number;
  ms: number;
  post: string | null;
  body: string;
  /** 요청 헤더 **이름**만. SPA만 보내는 헤더(H3)를 가려내기 위한 것이고 값은 남기지 않는다. */
  reqHeaders: string[];
}

/**
 * 컨텍스트의 **모든 페이지**에서 JSON 왕복을 기록한다.
 *
 * `recordJson`처럼 `page`에 붙이지 않는 이유: 이 사이트는 검색과 예약이 새 탭을
 * 연다(`reserve`·`doSearch` 스텝이 둘 다 `context.pages()`의 마지막을 집는다).
 * 첫 페이지에만 리스너를 걸면 정작 요금 콜이 나올 탭을 못 본다.
 */
function recordFlow(context: BrowserContext, phase: () => string): Capture[] {
  const captures: Capture[] = [];
  const started = new WeakMap<Request, number>();
  const noise = /google|facebook|doubleclick|kakao|naver|criteo|analytics|gtm|hotjar|clarity/i;
  context.on("request", (req: Request) => started.set(req, Date.now()));
  context.on("response", async (res: Response) => {
    const url = res.url();
    if (noise.test(url)) return;
    if (!(res.headers()["content-type"] ?? "").includes("json")) return;
    const t0 = started.get(res.request());
    let body: string;
    try {
      body = await res.text();
    } catch {
      // 네비게이션이 본문을 앗아갔다. 그래도 이 콜이 있었다는 사실은 남긴다 —
      // 조용히 버리면 "그런 콜은 없었다"와 구별되지 않는다.
      body = "(body unavailable — navigated away)";
    }
    captures.push({
      phase: phase(),
      method: res.request().method(),
      url,
      status: res.status(),
      ms: t0 ? Date.now() - t0 : -1,
      post: res.request().postData(),
      body,
      reqHeaders: Object.keys(res.request().headers()),
    });
  });
  return captures;
}

/**
 * 돈처럼 보이는 필드. **이름과 값을 둘 다** 본다.
 *
 * 어느 한쪽만 보면 이 프로젝트가 이미 두 번 걸린 함정에 걸린다:
 *   이름만 → 요금 필드가 `amt1` 같은 밋밋한 이름이면 놓친다.
 *   값만  → 리솜 `rmAmt`는 이름이 정확한데 506행 전부 `"0"`이었다.
 *           **필드가 있다고 값이 있는 게 아니다.**
 *
 * 그래서 이름이 맞으면 값이 0이어도 보고한다 — 그 0이 곧 "요금 코드는 여기,
 * 값은 딴 데"라는 신호였다.
 *
 * 배열은 인덱스를 지운 경로로 합산한다. 열거보다 세기가 중요하다는 이 파일의
 * 원칙 그대로 — 성수기 행에만 붙는 요금은 450개 중 3개로 나타난다.
 */
const MONEY_KEY = /amt|price|rate|fee|cost|charge|money|won|금액|요금|가격/i;

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
    for (let i = 0; i < payload.length; i++) moneyScan(payload[i], `${path}[]`, acc);
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
    // 압축 날짜(20260907)와 코드가 액수 자릿수에 걸린다. 날짜는 모양으로 빼고,
    // 나머지는 남겨서 사람이 판단하게 둔다 — 여기서 과하게 거르면 조사가 아니라
    // 확인이 된다.
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
    const why = hit.byName ? "이름" : "값";
    console.log(
      `  ${path}  ×${hit.hits}  (${why})  ${JSON.stringify(hit.values).slice(0, 120)}${range}`,
    );
  }
}

/** 응답 안에서 가장 긴 객체 배열 — `keyCensus`를 먹일 대상. */
function largestArray(
  payload: unknown,
  path = "",
  best: { path: string; rows: Array<Record<string, unknown>> } | null = null,
): { path: string; rows: Array<Record<string, unknown>> } | null {
  if (Array.isArray(payload)) {
    const rows = payload.filter((v) => v && typeof v === "object" && !Array.isArray(v));
    if (rows.length > (best?.rows.length ?? 0)) {
      best = { path: path || "(root)", rows: rows as Array<Record<string, unknown>> };
    }
    for (let i = 0; i < payload.length; i++) best = largestArray(payload[i], `${path}[]`, best);
    return best;
  }
  if (payload === null || typeof payload !== "object") return best;
  for (const [k, v] of Object.entries(payload)) {
    best = largestArray(v, path ? `${path}.${k}` : k, best);
  }
  return best;
}

/**
 * 결과 화면에서 **무엇이 클릭 가능한가**를 마크업에서 직접 읽는다.
 *
 * `dumpButtons`는 role=button만 보는데, 이 사이트의 달력 셀은 `<td>`이고 역할이
 * 없다(첫 실행에서 후보로 나온 것이 전부 헤더 내비였다). 셀렉터를 모르는 채
 * 찍으면 "클릭 못 함"이 "요금 콜 없음"으로 둔갑하므로, 추측 대신 DOM에게 묻는다.
 */
async function probeClickables(page: Page): Promise<string> {
  // 주의: `page.evaluate` 안에서 **이름을 갖는 함수를 만들지 말 것.** tsx가
  // esbuild의 `keepNames`로 빌드하므로 `const f = () => {}`조차 `__name(...)`으로
  // 감싸이는데 그 헬퍼는 브라우저에 없다 — 증상은 `__name is not defined`이고,
  // 실패 지점이 페이지 쪽이라 마크업이 바뀐 것처럼 읽힌다.
  // 인자로 바로 넘기는 익명 화살표는 이름이 없어 안전하다(파일의 다른 evaluate가
  // 전부 그 형태다). 그래서 조상 체인은 헬퍼 없이 for 루프로 편다.
  return page.evaluate(() => {
    const out: string[] = [];

    const leaves = Array.from(document.querySelectorAll("*")).filter(
      (e) => e.children.length === 0 && /마감임박|예약가능|예약마감|예약대기|잔여/.test(e.textContent ?? ""),
    );
    out.push(`상태 텍스트를 가진 말단 노드: ${leaves.length}`);
    for (const m of leaves.slice(0, 6)) {
      const chain: string[] = [];
      let cur: Element | null = m;
      while (cur && chain.length < 6) {
        const cls = String(cur.className || "").trim();
        chain.push(cur.tagName.toLowerCase() + (cls ? "." + cls.split(/\s+/).slice(0, 3).join(".") : ""));
        cur = cur.parentElement;
      }
      out.push(`  "${(m.textContent ?? "").trim().slice(0, 20)}" :: ${chain.join(" < ")}`);
    }

    const pointer = Array.from(
      document.querySelectorAll("td, li, a, div[data-date], [role=gridcell]"),
    ).filter((e) => getComputedStyle(e).cursor === "pointer");
    out.push(`\n커서가 pointer인 td/li/a/gridcell: ${pointer.length}`);
    for (const c of pointer.slice(0, 14)) {
      const cls = String(c.className || "").trim();
      const tag = c.tagName.toLowerCase() + (cls ? "." + cls.split(/\s+/).slice(0, 3).join(".") : "");
      const attrs = Array.from(c.attributes)
        .filter((a) => a.name.startsWith("data-") || a.name === "href")
        .map((a) => `${a.name}="${a.value.slice(0, 30)}"`)
        .join(" ");
      out.push(`  <${tag} ${attrs}> ${(c.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 45)}`);
    }
    return out.join("\n");
  });
}


// ─── 변형 조사 (2026-09-11): 접힌 행이 무엇을 접고 있나 ────────────────────
//
// `parse.ts`는 `resortTypeNm + roomTypeNm`으로 변형(`rmTypeCd`)을 한 행에 접는다.
// 운영자가 보고 싶은 것은 그 접힌 것들 — 뷰(스탠다드/파크뷰)와 세부(더블취사/
// 트윈취사)다. `keys`가 세어둔 15키에 `viewCd`는 있지만 **이름이 없고**, 세부 축은
// `room/detail`에만 있다(08-25 `flow`가 SPA 경유로 한 번 닿았고, 08-31 직접 POST는
// `W22M3S4` "이용회원번호는 필수입니다"로 거절). `variants` 스텝은 그 둘을 배선하기
// 전에 물어야 할 것을 묻는다 — 상세는 그 스텝의 주석.
//
// `userinfo`에는 회원사명·담당자·연락처가 평문으로 들어 있다. 롯데 `member` 스텝이
// 블랙리스트로 가리다가 터미널에 찍은 전례가 있어(`debug-page.ts`), 여기서는
// **값을 보여줄 키를 화이트리스트로** 고르고 나머지는 타입과 길이만 찍는다.
const SAFE_VALUE_KEY = /(Cd|Yn|Ind|Type|Grade|Seq|Div|Gubun|Cnt|Level|Flag)$/;
const SECRET_KEY = /No$|Nm$|Name|Phone|Tel|Mobile|Email|Addr|Birth|Id$|Pw|Pass/i;

function maskedShape(label: string, payload: unknown, path = "", depth = 0) {
  if (!path) console.log(`\n=== structure (masked): ${label} ===`);
  if (Array.isArray(payload)) {
    console.log(`  ${path || "(root)"} [] length=${payload.length}`);
    if (payload[0] && typeof payload[0] === "object") maskedShape(label, payload[0], `${path}[0]`, depth + 1);
    return;
  }
  if (payload === null || typeof payload !== "object") {
    const key = path.split(".").pop() ?? "";
    const str = String(payload);
    let shown: string;
    if (payload == null || payload === "") shown = JSON.stringify(payload);
    else if (SECRET_KEY.test(key)) shown = `${typeof payload}(len=${str.length}) ${str.slice(0, 2)}…`;
    else if (SAFE_VALUE_KEY.test(key) && str.length <= 6) shown = JSON.stringify(payload);
    else shown = `${typeof payload}(len=${str.length})`;
    console.log(`  ${path} = ${shown}`);
    return;
  }
  if (depth > 4) {
    console.log(`  ${path} {…}`);
    return;
  }
  for (const [k, v] of Object.entries(payload)) maskedShape(label, v, path ? `${path}.${k}` : k, depth + 1);
}

/** 요청 본문을 찍을 때 `*No` 값을 가린다 — `memNo`가 그 자리에 온다. */
function maskPost(post: string | null): string {
  if (!post) return "(no body)";
  return post.replace(/"(\w*No)":"([^"]*)"/g, (_, k, v) => `"${k}":"${String(v).slice(0, 2)}…(${String(v).length})"`);
}

/** 같은 URL을 한 번만 해부한다 — 페이징된 같은 엔드포인트가 리포트를 덮지 않게. */
function endpointOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

async function main() {
  const step = process.argv[2] ?? "main";
  const urlArg = process.argv[3];
  const browser = await launchBrowser();
  // Reuse the session `doLogin` saved, so exploratory steps run authenticated
  // without a fresh login each time.
  const saved =
    step !== "doLogin" && existsSync(STATE_FILE)
      ? JSON.parse(readFileSync(STATE_FILE, "utf8"))
      : null;
  if (saved) console.log(`[state] reusing ${STATE_FILE}`);
  const context = await newContextFromState(browser, saved);
  const page = await context.newPage();
  // The booking widget only renders at desktop width; at 1280 its controls sit
  // off-canvas (x≈1300) and every click times out.
  await page.setViewportSize({ width: 1920, height: 1080 });

  if (step === "main") {
    await page.goto(urlArg ?? SITE.home, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(5_000);
    await dismissLayers(page);
    await dump(page, "main");
    await dumpLinks(page, "header", "header");
    await dumpButtons(page);
    // Which domains does the page even talk to? Login/booking often live on
    // a different host than the marketing site.
    const hosts = await page.locator("a[href^='http']").evaluateAll((els) => [
      ...new Set(
        els
          .map((e) => {
            try {
              return new URL((e as HTMLAnchorElement).href).host;
            } catch {
              return "";
            }
          })
          .filter(Boolean),
      ),
    ]);
    console.log("outbound hosts:", JSON.stringify(hosts, null, 2));
  } else if (step === "login") {
    await page.goto(urlArg ?? SITE.login, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(5_000);
    await dismissLayers(page);
    await dump(page, "login");
    await dumpInputs(page);
    await dumpButtons(page, 30);
    // Tabs / member-type switches are the thing Lotte got wrong first
    // (리워즈 vs L.POINT). Surface every tab-ish control explicitly.
    const tabs = await page
      .locator("[role='tab'], .tab, [class*='tab'] a, [class*='tab'] button")
      .evaluateAll((els) =>
        els
          .map((e) => (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40))
          .filter(Boolean)
          .slice(0, 20),
      );
    console.log("tab-ish controls:", JSON.stringify(tabs));
    console.log("frames:", page.frames().map((f) => f.url().slice(0, 140)));
    try {
      console.log("aria snapshot (form):");
      console.log(await page.locator("form").first().ariaSnapshot());
    } catch {
      console.log("(no form element)");
    }
  } else if (step === "doLogin") {
    const { id, pw } = await resolveCredentials();
    console.log(`[login] using account "${id.slice(0, 2)}***" (${process.env.SONO_ID ? "env" : "db"})`);
    const calls = recordJson(page);
    await page.goto(urlArg ?? SITE.login, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(4_000);
    await dismissLayers(page);
    await page.locator(LOGIN_SEL.id).fill(id);
    await page.locator(LOGIN_SEL.pw).fill(pw);
    // There is no <form>, so Enter may not submit — click the button that sits
    // next to the password field rather than the header's 로그인 link.
    const submit = page
      .locator(`${LOGIN_SEL.pw} >> xpath=ancestor::*[self::div or self::section][3]`)
      .getByRole("button", { name: "로그인" })
      .last();
    try {
      await submit.click({ timeout: 5_000 });
      console.log("[login] submitted via scoped button");
    } catch {
      await page.getByRole("button", { name: "로그인", exact: true }).last().click({ timeout: 8_000 });
      console.log("[login] submitted via last 로그인 button");
    }
    await page.waitForTimeout(8_000);
    await dump(page, "after-login");
    writeFileSync(STATE_FILE, JSON.stringify(await context.storageState(), null, 2));
    console.log(`[state] saved ${STATE_FILE}`);
    const alerts = await page.locator("[role='alert']").allInnerTexts();
    console.log("alerts:", JSON.stringify(alerts.map((a) => a.trim()).filter(Boolean)));
    console.log("cookies:", JSON.stringify(
      (await context.cookies()).map((c) => ({ name: c.name, domain: c.domain })),
      null,
      2,
    ));
    console.log("json calls during login:\n" + calls.map((c) => c.line).join("\n"));
    // Candidate session probes — whichever returns a stable authenticated
    // signal becomes `checkLoggedIn` in sono/login.ts.
    for (const probe of (process.env.SONO_PROBES ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
      try {
        const res = await page.request.get(probe, { timeout: 10_000 });
        const body = (await res.text()).slice(0, 300);
        console.log(`[probe] ${res.status()} ${probe}\n  ${body}`);
      } catch (e) {
        console.log(`[probe] failed ${probe}:`, e instanceof Error ? e.message : e);
      }
    }
  } else if (step === "reserve") {
    // Follow the site's own "통합예약" entry and record what it loads. The
    // reservation flow lives behind a button, not a link, so the URL it lands
    // on is itself a discovery.
    const calls = recordJson(page);
    // The header's CTA sits at x≈1300, off-canvas in the default 1280 viewport.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(urlArg ?? SITE.home, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(4_000);
    await dismissLayers(page);
    calls.length = 0;
    // The header renders both a mobile and a desktop copy of the CTA; the one
    // that matches first sits in `.top-mobile`, parked outside the viewport at
    // desktop width. Click whichever copy is actually on screen.
    const ctas = page.getByRole("button", { name: "통합예약" });
    const n = await ctas.count();
    console.log(`통합예약 buttons: ${n}`);
    let clicked = false;
    for (let i = 0; i < n; i++) {
      const cta = ctas.nth(i);
      const box = await cta.boundingBox();
      console.log(`  [${i}] box=${JSON.stringify(box)}`);
      if (!box || box.y < 0 || box.x < 0) continue;
      try {
        await cta.click({ timeout: 5_000 });
        console.log(`clicked 통합예약 [${i}]`);
        clicked = true;
        break;
      } catch (e) {
        console.log(`  click [${i}] failed:`, e instanceof Error ? e.message.slice(0, 80) : e);
      }
    }
    if (!clicked) console.log("no clickable 통합예약 found");
    await page.waitForTimeout(9_000);
    const target = context.pages()[context.pages().length - 1];
    console.log("landed on:", target.url());
    console.log("open pages:", context.pages().map((p) => p.url()));
    await target.screenshot({ path: `${OUT}-reserve.png` });
    console.log(`screenshot: ${OUT}-reserve.png`);
    console.log("json responses:\n" + calls.map((c) => c.line).join("\n"));
    const opts = await target.locator("select option").evaluateAll((els) =>
      els.map((e) => ({ v: e.getAttribute("value"), t: (e.textContent ?? "").trim() })),
    );
    console.log("select options:", JSON.stringify(opts.slice(0, 60), null, 2));
    await dumpButtons(target, 50);
  } else if (step === "api") {
    // Call a discovered endpoint directly with the saved session cookies —
    // the same `page.request` mechanism sono/search.ts will use, so a 200 here
    // is evidence the crawler can skip the DOM entirely.
    if (!urlArg) throw new Error("usage: debug-sono.ts api <url>");
    await page.goto(SITE.home, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const res = await page.request.get(urlArg, {
      timeout: 20_000,
      headers: { Accept: "application/json", Referer: SITE.home },
    });
    console.log("status:", res.status());
    const text = await res.text();
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2).slice(0, Number(process.env.API_MAX ?? 20_000)));
    } catch {
      console.log(text.slice(0, 3_000));
    }
  } else if (step === "apiPost") {
    // Can the room-list POST be reproduced outside the SPA? If yes, sono has
    // the same shape as Lotte: browser for login only, plain requests for search.
    if (!urlArg) throw new Error("usage: debug-sono.ts apiPost <url>  (body on stdin via POST_BODY)");
    await page.goto(SITE.home, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const body = JSON.parse(process.env.POST_BODY ?? "{}");
    const res = await page.request.post(urlArg, {
      timeout: 25_000,
      headers: { "content-type": "application/json", Accept: "application/json", Referer: `${SITE.home}/reserve/room?step=sch` },
      data: body,
    });
    console.log("status:", res.status());
    const text = await res.text();
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2).slice(0, Number(process.env.API_MAX ?? 8_000)));
    } catch {
      console.log(text.slice(0, 2_000));
    }
  } else if (step === "widget") {
    // The desktop home page (≥ ~1440px) carries the booking widget inline:
    // 지역 또는 숙소 선택 / 숙박 기간 선택 / 객실 및 인원 선택 / 검색.
    // Open the property picker and dump it — that panel is the branch list.
    const calls = recordJson(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(urlArg ?? SITE.home, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(4_000);
    await dismissLayers(page);
    calls.length = 0;

    await page.getByRole("button", { name: "지역 또는 숙소 선택" }).first().click({ timeout: 10_000 });
    await page.waitForTimeout(3_000);
    await dump(page, "widget-places");
    console.log("json after opening picker:\n" + calls.map((c) => c.line).join("\n"));

    // Everything clickable inside the opened panel, with its data-* payload.
    const items = await page
      .locator("[class*='layer'], [class*='popup'], [class*='modal'], [role='dialog']")
      .last()
      .locator("a, button, li, label, input")
      .evaluateAll((els) =>
        els
          .map((e) => ({
            tag: e.tagName,
            text: (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40),
            attrs: Object.fromEntries(
              Array.from(e.attributes)
                .filter(
                  (a) =>
                    a.name.startsWith("data-") ||
                    ["value", "href", "id", "name"].includes(a.name),
                )
                .map((a) => [a.name, a.value.slice(0, 120)]),
            ),
          }))
          .filter((o) => o.text || Object.keys(o.attrs).length)
          .slice(0, 200),
      );
    console.log("picker items:", JSON.stringify(items, null, 2));
  } else if (step === "doSearch") {
    // Drive the booking widget once: pick a store, hit 검색, and record every
    // JSON response. Whatever fires here is the availability endpoint.
    const store = urlArg ?? "소노벨 A";
    const calls = recordJson(page);
    // Full request/response capture for the endpoints that matter — the URL
    // alone doesn't tell us the POST shape sono/search.ts has to reproduce.
    const payloads: { method: string; url: string; post: string | null; body: string }[] = [];
    const wanted = /memberReservation\/(room\/(list|filter|reserve\/pre)|holiday)/;
    page.on("response", async (res) => {
      if (!wanted.test(res.url())) return;
      try {
        payloads.push({
          method: res.request().method(),
          url: res.url(),
          post: res.request().postData(),
          body: await res.text(),
        });
      } catch {
        /* body already consumed / navigation */
      }
    });
    await page.goto(SITE.home, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(4_000);
    await dismissLayers(page);
    await page.getByRole("button", { name: "지역 또는 숙소 선택" }).first().click({ timeout: 10_000 });
    await page.waitForTimeout(2_500);
    await page.getByText(store, { exact: true }).first().click({ timeout: 8_000 });
    console.log(`picked store: ${store}`);
    await page.waitForTimeout(2_000);
    calls.length = 0;
    await page.getByRole("button", { name: "검색", exact: true }).first().click({ timeout: 8_000 });
    await page.waitForTimeout(10_000);
    const target = context.pages()[context.pages().length - 1];
    console.log("landed on:", target.url());
    await target.screenshot({ path: `${OUT}-search.png` });
    console.log(`screenshot: ${OUT}-search.png`);
    console.log("json responses after 검색:\n" + calls.map((c) => c.line).join("\n"));
    console.log("\n=== payloads ===");
    for (const p of payloads) {
      console.log(`\n### ${p.method} ${p.url}`);
      if (p.post) console.log("request:", p.post.slice(0, 2_000));
      console.log("response:", p.body.slice(0, Number(process.env.API_MAX ?? 6_000)));
    }
  } else if (step === "net") {
    // Manual-drive mode: the recorder runs while YOU perform a real search in
    // the visible browser. Automating the widget before knowing its shape is
    // exactly the guesswork this step exists to avoid.
    const waitMs = Number(process.env.NET_WAIT_MS ?? 90_000);
    const calls = recordJson(page);
    await page.goto(urlArg ?? SITE.booking, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3_000);
    await dismissLayers(page);
    console.log(
      `\n>>> 브라우저에서 직접 지점·날짜를 골라 검색하세요. ${Math.round(waitMs / 1000)}초 동안 JSON 응답을 기록합니다.\n`,
    );
    await page.waitForTimeout(waitMs);
    await dump(page, "net-final");
    console.log(`json responses (${calls.length}):`);
    console.log(calls.map((c) => c.line).join("\n"));
    // Anything that smells like inventory gets flagged for a closer look.
    const inventoryish = calls.filter((c) =>
      /room|avail|inven|stock|rsv|reserv|price|rate|product|goods/i.test(c.url),
    );
    console.log(`\ninventory-ish (${inventoryish.length}):`);
    console.log(inventoryish.map((c) => c.line).join("\n"));
    console.log("\nfinal url:", page.url());
  } else if (step === "branches") {
    const calls = recordJson(page);
    await page.goto(urlArg ?? SITE.booking, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(6_000);
    await dismissLayers(page);
    await dump(page, "branches");
    // Source 1: native selects
    const options = await page.locator("select option").evaluateAll((els) =>
      els.map((e) => ({
        value: e.getAttribute("value"),
        text: (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40),
      })),
    );
    console.log("select options:", JSON.stringify(options, null, 2));
    // Source 2: anything carrying a resort-ish name plus a data attribute
    const named = await page
      .locator("a, button, li, label")
      .evaluateAll((els) =>
        els
          .map((e) => ({
            tag: e.tagName,
            text: (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40),
            attrs: Object.fromEntries(
              Array.from(e.attributes)
                .filter(
                  (a) =>
                    a.name.startsWith("data-") || ["value", "href", "id"].includes(a.name),
                )
                .map((a) => [a.name, a.value.slice(0, 120)]),
            ),
          }))
          .filter(
            (o) =>
              /소노|비발디|델피노|오션|쏠비치|해운대|경주|변산|단양|고양|천안|제주|여수|홍천|양양/.test(
                o.text,
              ) && o.text.length < 40,
          )
          .slice(0, 80),
      );
    console.log("property-ish elements:", JSON.stringify(named, null, 2));
    console.log("json responses:\n" + calls.map((c) => c.line).join("\n"));
  } else if (step === "rows") {
    // Exercise sono/search.ts + parse.ts standalone, same shape as
    // debug-page.ts's `roomlist` step. Requires those files to exist.
    const { performSearch } = await import("../src/crawlers/sono/search");
    const { parseDate, todayKstIso, addDaysUtc } = await import("../src/lib/utils");
    const checkin = parseDate(todayKstIso());
    const ctx = {
      resortId: "debug",
      slug: "sono",
      context,
      page,
      credentials: { id: process.env.SONO_ID ?? "", pw: process.env.SONO_PW ?? "" },
      log: (msg: string, meta?: Record<string, unknown>) => console.log(msg, meta ?? ""),
      // 조사 스크립트에는 Vercel 60초 예산이 없다. 크롤러가 선택적 작업을
      // 포기하지 않도록 넉넉히 잡는다 — 여기서 재는 것은 시간이 아니라 동작이다.
      deadlineAt: Date.now() + 10 * 60_000,
    };
    const rows = await performSearch(ctx, {
      checkin,
      checkout: addDaysUtc(checkin, 1),
      ...(urlArg ? { branch: urlArg } : {}),
    });
    console.log(`rows: ${rows.length}`);
    console.log(JSON.stringify(rows.slice(0, 8), null, 2));
    const byBranch: Record<string, number> = {};
    for (const r of rows) byBranch[r.branchName] = (byBranch[r.branchName] ?? 0) + 1;
    console.log("per branch:", byBranch);
    const regions = [...new Set(rows.map((r) => r.region))];
    console.log("regions:", JSON.stringify(regions));
  } else if (step === "span") {
    // Two properties of the room list decide how many requests a full sweep
    // costs, and both are invisible from a single call:
    //
    //   1. the requested date only selects a MONTH (measured 2026-08-09:
    //      0809/0820/0831 all returned 0809-0831, 0915 returned 0901-0930),
    //      clipped at today and extended by `nights - 1` days;
    //   2. `nights` changes no status or count — 1, 2 and 7 nights returned
    //      byte-identical rows on every shared entry.
    //
    // Together they are why `parse.ts` reads the response as a calendar and
    // AND-s the nights itself, and why 60 hot windows cost 4 requests. If a
    // sweep ever starts costing 60 again, or 2-night availability starts
    // matching 1-night exactly, re-run this.
    const { SONO } = await import("../src/crawlers/sono/config");
    const { fetchMemberNo } = await import("../src/crawlers/sono/login");
    const { todayKstIso, parseDate, addDaysUtc, toIsoDate } = await import("../src/lib/utils");
    const { formatDateCompact } = await import("../src/crawlers/sono/format");
    const stores = SONO.branches.slice(0, 2);

    const ctx = {
      resortId: "debug",
      slug: "sono",
      context,
      page,
      credentials: { id: "", pw: "" },
      log: (m: string, meta?: Record<string, unknown>) => console.log(m, meta ?? ""),
      // 조사 스크립트에는 Vercel 60초 예산이 없다. 크롤러가 선택적 작업을
      // 포기하지 않도록 넉넉히 잡는다 — 여기서 재는 것은 시간이 아니라 동작이다.
      deadlineAt: Date.now() + 10 * 60_000,
    };
    await page.goto(SITE.home, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const memNo = await fetchMemberNo(ctx);
    if (!memNo) throw new Error("no memNo — run `doLogin` first");

    const call = async (ciYmd: string, nights: number) => {
      const checkin = parseDate(`${ciYmd.slice(0, 4)}-${ciYmd.slice(4, 6)}-${ciYmd.slice(6, 8)}`);
      const res = await page.request.post(
        `${SONO.apiBase}/memberReservation/room/list/pc?lang=ko&deviceType=PC&mobileAppYn=N`,
        {
          timeout: SONO.timeouts.api,
          headers: { "content-type": "application/json", Accept: "application/json", Referer: SONO.bookingUrl },
          data: {
            memNo,
            ...SONO.request,
            ciYmd,
            coYmd: formatDateCompact(addDaysUtc(checkin, nights)),
            nights,
            storeCdList: stores.map((b) => b.storeCd),
            rmTypeCode: "",
          },
        },
      );
      const json = (await res.json()) as {
        body?: Array<{ rmTypeList?: Array<Record<string, unknown>> }>;
      };
      const entries = (json.body ?? []).flatMap((s) => s.rmTypeList ?? []);
      const dates = [...new Set(entries.map((e) => String(e.ciYmd)))].sort();
      return { entries, dates };
    };

    const today = todayKstIso().replace(/-/g, "");
    console.log("\n(1) which dates come back, per requested date");
    console.log("req        nights  entries  days  span");
    for (const ci of [today, formatDateCompact(addDaysUtc(parseDate(todayKstIso()), 11)), "20260915"]) {
      const { entries, dates } = await call(ci, 1);
      console.log(
        `${ci}   1     ${String(entries.length).padStart(6)}  ${String(dates.length).padStart(4)}  ${dates[0]} → ${dates[dates.length - 1]}`,
      );
    }

    console.log("\n(2) does `nights` change anything?");
    const key = (e: Record<string, unknown>) => `${e.storeCd}|${e.ciYmd}|${e.rmTypeCd}`;
    const base = await call(today, 1);
    const baseMap = new Map(base.entries.map((e) => [key(e), e]));
    for (const nights of [2, 7]) {
      const other = await call(today, nights);
      let shared = 0;
      let differing = 0;
      for (const e of other.entries) {
        const b = baseMap.get(key(e));
        if (!b) continue;
        shared++;
        if (b.rsvStatusCd !== e.rsvStatusCd || b.rsvRmCnt !== e.rsvRmCnt) differing++;
      }
      console.log(
        `  1night vs ${nights}night: shared=${shared} differing=${differing}` +
          (differing === 0 ? "  ← nights is ignored" : "  ← nights MATTERS, parse.ts must change"),
      );
    }
    console.log(`\n(today = ${toIsoDate(parseDate(todayKstIso()))})`);
  } else if (step === "keys") {
    // 금액 조사, SONO. `doSearch` already dumps bodies, but it truncates at
    // `API_MAX ?? 6_000` characters and one call is 2.6MB — so what it has been
    // showing all along is the first few entries of the first store. A rate key
    // could have been in every response since August and stayed off-screen.
    //
    // This step asks one store only. Narrowing the request is what makes a full,
    // untruncated census affordable; `storeCdList` is an array precisely so the
    // caller can decide how much to ask for.
    const { SONO } = await import("../src/crawlers/sono/config");
    const { fetchMemberNo } = await import("../src/crawlers/sono/login");
    const { todayKstIso, parseDate, addDaysUtc } = await import("../src/lib/utils");
    const { formatDateCompact } = await import("../src/crawlers/sono/format");

    const store = SONO.branches.find((b) => b.value === urlArg) ?? SONO.branches[0];
    const ctx = {
      resortId: "debug",
      slug: "sono",
      context,
      page,
      credentials: { id: "", pw: "" },
      log: (m: string, meta?: Record<string, unknown>) => console.log(m, meta ?? ""),
      // 조사 스크립트에는 Vercel 60초 예산이 없다. 크롤러가 선택적 작업을
      // 포기하지 않도록 넉넉히 잡는다 — 여기서 재는 것은 시간이 아니라 동작이다.
      deadlineAt: Date.now() + 10 * 60_000,
    };
    // Q2 — anything the reservation screen loads besides the room list.
    const calls = recordJson(page);
    await page.goto(SITE.home, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const memNo = await fetchMemberNo(ctx);
    if (!memNo) throw new Error("no memNo — run `doLogin` first");
    console.log(`store: ${store.value} (storeCd=${store.storeCd})`);

    const checkin = addDaysUtc(parseDate(todayKstIso()), 14);
    const call = async (nights: number) => {
      const res = await page.request.post(
        `${SONO.apiBase}/memberReservation/room/list/pc?lang=ko&deviceType=PC&mobileAppYn=N`,
        {
          timeout: SONO.timeouts.api,
          headers: {
            "content-type": "application/json",
            Accept: "application/json",
            Referer: SONO.bookingUrl,
          },
          data: {
            memNo,
            ...SONO.request,
            ciYmd: formatDateCompact(checkin),
            coYmd: formatDateCompact(addDaysUtc(checkin, nights)),
            nights,
            storeCdList: [store.storeCd],
            rmTypeCode: "",
          },
        },
      );
      const json = (await res.json()) as Record<string, unknown>;
      const body = (json.body ?? []) as Array<Record<string, unknown>>;
      const entries = body.flatMap((s) => (s.rmTypeList ?? []) as Array<Record<string, unknown>>);
      return { json, body, entries, status: res.status() };
    };

    const one = await call(1);
    console.log(`\nHTTP ${one.status}: ${one.body.length} stores, ${one.entries.length} entries`);
    envelopeKeys("room/list/pc response", one.json);
    // The store object wraps the room list; a per-store total (a "from" price
    // on the store card) would live here rather than on the entries.
    keyCensus(
      "body[] — the store objects",
      one.body.map((s) => Object.fromEntries(Object.entries(s).filter(([k]) => k !== "rmTypeList"))),
    );
    keyCensus("body[].rmTypeList[] — 1박", one.entries);

    // Q3 — `nights` is known to change no status or count (span step). Asked
    // again of every numeric key: "the calendar ignores nights" and "a rate
    // ignores nights" are separate claims and only the first was measured.
    console.log("\n=== numeric keys across 1 / 2 / 3 nights (Q3) ===");
    const key = (e: Record<string, unknown>) => `${e.storeCd}|${e.ciYmd}|${e.rmTypeCd}`;
    const byNights = new Map<number, Array<Record<string, unknown>>>([[1, one.entries]]);
    for (const nights of [2, 3]) byNights.set(nights, (await call(nights)).entries);
    const probe = one.entries[0];
    if (!probe) {
      console.log("  (no entries — pick another date and re-run)");
    } else {
      const numericKeys = [
        ...new Set(
          one.entries.flatMap((e) =>
            Object.entries(e)
              .filter(([, v]) => asNumber(v) !== null)
              .map(([k]) => k),
          ),
        ),
      ];
      console.log(`  probe entry: ${key(probe)}`);
      for (const k of numericKeys) {
        const cells = [1, 2, 3].map((n) => {
          const hit = (byNights.get(n) ?? []).find((e) => key(e) === key(probe));
          return `${n}박=${hit ? String(hit[k]) : "-"}`;
        });
        console.log(`  ${k}: ${cells.join("  ")}`);
      }
    }

    // Q6 — THE question for this resort. `parse.ts:60-66` folds several
    // `rmTypeCd` (평형/뷰 variants) into one row on purpose, because the row
    // stores booleans and nothing is lost. A rate is not a boolean: if the
    // variants disagree, this resort's rows cannot carry an exact amount and a
    // rate would have to be folded to a minimum and labelled "부터".
    console.log("\n=== variants folded into one row: do their numbers agree? (Q6) ===");
    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const e of one.entries) {
      const roomType = [e.resortTypeNm, e.roomTypeNm].filter(Boolean).join(" ");
      const g = `${e.ciYmd}|${roomType}`;
      groups.set(g, [...(groups.get(g) ?? []), e]);
    }
    const multi = [...groups.entries()].filter(([, rows]) => rows.length > 1);
    console.log(`  ${multi.length} of ${groups.size} (date, room type) groups fold more than one variant`);
    const numericKeys = [
      ...new Set(
        one.entries.flatMap((e) =>
          Object.entries(e)
            .filter(([, v]) => asNumber(v) !== null)
            .map(([k]) => k),
        ),
      ),
    ];
    for (const k of numericKeys) {
      let spread = 0;
      let widest = 0;
      for (const [, rows] of multi) {
        const nums = rows.map((r) => asNumber(r[k])).filter((n): n is number => n !== null);
        if (nums.length < 2) continue;
        const gap = Math.max(...nums) - Math.min(...nums);
        if (gap > 0) spread++;
        widest = Math.max(widest, gap);
      }
      console.log(
        `  ${k}: ${spread}/${multi.length} groups disagree, widest gap ${widest}` +
          (spread ? "  ← cannot be one exact number on the row" : ""),
      );
    }

    console.log("\n=== JSON calls the site made (Q2) ===");
    console.log(calls.length ? calls.map((c) => `  ${c.line}`).join("\n") : "  (none)");
  } else if (step === "flow") {
    // 금액 조사 Q2. 이 스텝의 전제는 하나다 — **검색 결과에서 멈추면 안 된다.**
    // 리솜의 요금 콜은 달력이 아니라 "객실을 클릭한 다음"에 나왔다.
    //
    // 자동 클릭은 실패할 수 있고(결과 화면 DOM을 지금 모른다), 그 실패가
    // "요금 콜이 없다"로 읽히는 것이 이 조사가 낼 수 있는 최악의 오답이다.
    // 그래서 실패는 반드시 크게 말하고 수동 모드를 가리킨다.
    const manual = process.env.SONO_FLOW_MANUAL === "1";
    const store = urlArg ?? "소노벨 비발디파크 A";
    let phase = "boot";
    const captures = recordFlow(context, () => phase);

    await page.goto(SITE.home, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(4_000);
    await dismissLayers(page);

    if (manual) {
      const waitMs = Number(process.env.NET_WAIT_MS ?? 120_000);
      phase = "manual";
      console.log("\n>>> 브라우저에서 직접 지점·날짜를 고르고 검색한 뒤,");
      console.log(">>> **예약 가능한 객실을 클릭**해서 다음 화면까지 들어가세요.");
      console.log(`>>> ${Math.round(waitMs / 1000)}초 동안 모든 JSON을 본문까지 기록합니다.\n`);
      await page.waitForTimeout(waitMs);
    } else {
      phase = "search";
      let searched = false;
      try {
        await page
          .getByRole("button", { name: "지역 또는 숙소 선택" })
          .first()
          .click({ timeout: 10_000 });
        await page.waitForTimeout(2_500);
        await page.getByText(store, { exact: true }).first().click({ timeout: 8_000 });
        console.log(`picked store: ${store}`);
        await page.waitForTimeout(2_000);
        await page.getByRole("button", { name: "검색", exact: true }).first().click({ timeout: 8_000 });
        await page.waitForTimeout(10_000);
        searched = true;
      } catch (e) {
        console.log("[flow] 자동 검색 실패:", e instanceof Error ? e.message.slice(0, 160) : e);
      }

      const results = context.pages()[context.pages().length - 1];
      await dump(results, "flow-search");
      if (!searched) {
        console.log("\n!!! 검색을 자동으로 몰지 못했습니다. 아래 후보를 보고");
        console.log("!!! SONO_FLOW_MANUAL=1 로 다시 실행하세요.\n");
      }
      console.log("\n=== 검색 결과 화면의 클릭 후보 (role=button) ===");
      await dumpButtons(results, 60);
      console.log("\n=== 결과 화면 마크업 probe ===");
      console.log(await probeClickables(results).catch((e) => `probe 실패: ${e}`));
      await dismissLayers(results);

      // 달력 다음 한 걸음 — 그리고 그 다음. 요금이 어느 홉에 있는지 모르므로
      // **한 번 클릭하고 끝내지 않고** 최대 3홉을 걸으며 홉마다 URL·새 JSON·
      // 남은 후보를 찍는다. 리솜의 요금 콜은 "객실 클릭" 한 홉에 있었지만,
      // 이 사이트는 `/reserve/room?step=…`으로 단계가 쪼개져 있다(관측된 것만
      // `sch`·`memTicket` 둘).
      //
      // 후보 1순위는 **달력 셀**이다. 첫 실행에서 role=button 목록이 헤더 내비뿐이라
      // "통합예약 홈"을 눌렀는데, 마크업 probe가 진짜 셀은 역할 없는 `<td>`
      // (`div.calendar > table > tbody > tr.state > td > div.approach`)임을 알려줬다.
      phase = "roomclick";
      for (let hop = 1; hop <= 5; hop++) {
        const target = context.pages()[context.pages().length - 1];
        const before = captures.length;
        const urlBefore = target.url();

        // 우선순위 1 — 열려 있는 모달. 이 사이트는 위약 구간 날짜를 고르면
        // "예약을 진행하시겠습니까?" 확인창을 띄우고, 그동안 달력은 뒤에 그대로
        // 보이면서 클릭만 막힌다. 모달을 먼저 보지 않으면 홉이 여기서 죽고,
        // 그 죽음이 "다음 단계가 없다"로 읽힌다.
        const modalOk = target
          .getByRole("button", { name: /^(확인|예|진행)$/ })
          .filter({ visible: true })
          .first();
        // 우선순위 2 — 예약 가능한 날짜 셀. `div.approach`(마감임박)와 `예약가능`은
        // 둘 다 "방이 있다"이고, 마감/불가 셀은 눌러도 아무 일도 안 일어난다.
        const dayCell = target
          .locator("div.calendar td")
          .filter({ hasText: /마감임박|예약가능/ })
          .first();
        // 우선순위 3 — 달력을 이미 지났다면 평범한 진행 컨트롤.
        const nextCtl = target
          .getByRole("button", { name: /다음|선택하기|예약하기|계속/ })
          .or(target.getByRole("link", { name: /다음|선택하기|예약하기|계속/ }))
          .filter({ visible: true })
          .first();

        let label = "";
        try {
          if (await modalOk.count()) {
            label = `모달 확인 "${(await modalOk.textContent())?.trim().slice(0, 20)}"`;
            await modalOk.click({ timeout: 6_000 });
          } else if (await dayCell.count()) {
            label = `달력 셀 "${(await dayCell.textContent())?.trim().replace(/\s+/g, " ").slice(0, 30)}"`;
            await dayCell.click({ timeout: 6_000 });
          } else if (await nextCtl.count()) {
            label = `컨트롤 "${(await nextCtl.textContent())?.trim().slice(0, 30)}"`;
            await nextCtl.click({ timeout: 6_000 });
          } else {
            console.log(`\n[hop ${hop}] 누를 것이 없습니다.`);
            break;
          }
        } catch (e) {
          console.log(`\n[hop ${hop}] 클릭 실패:`, e instanceof Error ? e.message.slice(0, 140) : e);
          break;
        }
        await page.waitForTimeout(7_000);

        const after = context.pages()[context.pages().length - 1];
        await dismissLayers(after).catch(() => undefined);
        const fresh = captures.slice(before);
        console.log(`\n[hop ${hop}] ${label}`);
        console.log(`  url: ${urlBefore}\n    → ${after.url()}`);
        console.log(`  새 JSON ${fresh.length}건:`);
        for (const c of fresh) console.log(`    ${c.status} ${c.method} ${c.url.slice(0, 130)}`);
        await dump(after, `flow-hop${hop}`);
        console.log(await probeClickables(after).catch((e) => `  probe 실패: ${e}`));
      }
      // 무엇을 찾았든 못 찾았든, "요금 콜이 없다"와 "셀렉터를 못 찾았다"는
      // 다른 말이다. 후자일 때 전자로 기록되는 것이 이 조사의 최악의 실패다.
      console.log("\n!!! 위 홉에서 요금다운 콜이 안 보였다면 그것은 아직 '없다'가 아니다.");
      console.log("!!! SONO_FLOW_MANUAL=1 NET_WAIT_MS=180000 로 손으로 몰아 확인할 것.");
    }

    // ── 리포트 ────────────────────────────────────────────────────────────
    console.log(`\n\n=== 전체 JSON 왕복 ${captures.length}건 ===`);
    for (const c of captures) {
      console.log(
        `  [${c.phase}] ${c.status} ${c.method} ${c.ms}ms ${c.url.slice(0, 150)}` +
          ` (${c.body.length}B)`,
      );
    }

    // 이미 아는 것과 새로 나온 것을 가른다. 크롤러가 부르는 두 엔드포인트는
    // 조사 대상이 아니다 — 그 둘은 `keys`가 이미 전수 조사했다.
    const known = /memberReservation\/room\/list|management\/auth/;
    const novel = captures.filter((c) => !known.test(c.url));
    console.log(`\n=== 크롤러가 모르는 엔드포인트 ${new Set(novel.map((c) => endpointOf(c.url))).size}종 ===`);

    const seenEndpoint = new Set<string>();
    for (const c of novel) {
      const ep = endpointOf(c.url);
      if (seenEndpoint.has(ep)) continue;
      seenEndpoint.add(ep);
      let payload: unknown;
      try {
        payload = JSON.parse(c.body);
      } catch {
        continue;
      }
      console.log(`\n\n#################### ${c.method} ${ep}`);
      console.log(`status ${c.status} · ${c.ms}ms · ${c.body.length}B · phase=${c.phase}`);
      // 요청이 무엇을 키로 받는지가 Q3(비용)의 절반이다. 날짜·지점·객실유형을
      // 전부 물으면 행마다 한 콜이고, 지점만 물으면 지점당 한 콜이다.
      if (c.post) console.log(`request: ${c.post.slice(0, 1_200)}`);
      envelopeKeys(ep, payload);
      reportMoney(ep, payload);
      const arr = largestArray(payload);
      if (arr && arr.rows.length) keyCensus(`${ep} → ${arr.path}`, arr.rows);
    }

    // Q3 — 비용. "있다/없다"만 답하고 끝내면 리솜의 1,518콜을 다시 만난다.
    console.log("\n=== Q3 비용 ===");
    const byEndpoint = new Map<string, { n: number; ms: number[] }>();
    for (const c of novel) {
      const e = byEndpoint.get(endpointOf(c.url)) ?? { n: 0, ms: [] };
      e.n++;
      if (c.ms >= 0) e.ms.push(c.ms);
      byEndpoint.set(endpointOf(c.url), e);
    }
    for (const [ep, e] of byEndpoint) {
      const avg = e.ms.length ? Math.round(e.ms.reduce((a, b) => a + b, 0) / e.ms.length) : -1;
      console.log(`  ${ep}  ×${e.n}  평균 ${avg}ms`);
    }
    console.log(
      "\n  판단 기준: 이 콜이 **객실 하나당 하나**면 리솜과 같은 처지다(3지점 ×",
    );
    console.log("  11객실유형 × 46일 ≈ 1,518콜 → 정기 수집 불가, '최신화'에서만).");
    console.log("  한 콜이 여러 객실을 답하면 지점당 1콜로 끝나 사정이 완전히 다르다.");

    // Q4 — 붙일 수 있는가. 소노만 가진 두 번째 장벽.
    console.log("\n=== Q4 우리 행에 붙일 수 있는가 ===");
    console.log("  sono/parse.ts는 평형·뷰 변형을 `resortTypeNm + roomTypeNm` 하나로 접는다");
    console.log("  (150개 그룹 중 90개가 2개 이상을 접고, 잔여 수는 83개에서 서로 다르다).");
    console.log("  요금 콜이 `rmTypeCd`(변형) 단위로 답한다면 접힌 행에 붙일 값이 하나로");
    console.log("  정해지지 않는다 — 최저가로 접고 행이 스스로 '~부터'라고 말해야 한다.");
    console.log("  위 request 필드에 `rmTypeCd`가 있는지부터 볼 것.");

    console.log(`\n(JSON 왕복 ${captures.length}건 중 크롤러가 모르는 것 ${novel.length}건)`);
  } else if (step === "variants") {
    // 변형 조사 (2026-09-11). 다섯 파트, 각자 try/catch — Part 3(`room/detail`
    // 재현)이 죽어도 Part 1·2의 census는 남아야 한다. 인자: 지점 value를 쉼표로.
    //
    //   Part 1  (지점, 객실유형)별 코드 census — viewCd가 전역 어휘인가 지점별인가
    //   Part 2  rmTypeCd의 정체·안정성, rmTypeCode 프로브, **2박에서 접기 판정이
    //           변형 판정과 갈리는 행 수**(parse.ts를 변형 유도로 바꾸는 근거)
    //   Part 3  viewCd 이름표 출처 — userinfo(마스킹) · 번들 스캔 · room/detail 재현
    //   Part 4  room/detail이 열렸다면 그 어휘(viewNm? bedNm? cookNm?)와 조인율
    //   Part 5  비용 — storeCdList 1/4/8, 응답 폭
    const { SONO } = await import("../src/crawlers/sono/config");
    const { fetchMemberNo } = await import("../src/crawlers/sono/login");
    const { todayKstIso, parseDate, addDaysUtc } = await import("../src/lib/utils");
    const { formatDateCompact, parseDateCompact } = await import("../src/crawlers/sono/format");

    type Entry = Record<string, unknown>;
    type Branch = (typeof SONO.branches)[number];
    const str = (e: Entry, k: string) => (e[k] == null ? "" : String(e[k]));
    const omit = (o: Entry, ...keys: string[]) =>
      Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));

    const wanted = (urlArg ?? "소노벨 청송,소노벨 A 비발디파크,소노캄 고양,소노벨 제주")
      .split(",")
      .map((x) => x.trim());
    const stores = wanted
      .map((v) => SONO.branches.find((b) => b.value === v))
      .filter((b): b is Branch => !!b);
    if (!stores.length) throw new Error(`no matching store in ${JSON.stringify(wanted)}`);

    let phase = "boot";
    const captures = recordFlow(context, () => phase);

    const ctx = {
      resortId: "debug",
      slug: "sono",
      context,
      page,
      credentials: { id: "", pw: "" },
      log: (m: string, meta?: Record<string, unknown>) => console.log(m, meta ?? ""),
      deadlineAt: Date.now() + 10 * 60_000,
    };
    await page.goto(SITE.home, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const memNo = await fetchMemberNo(ctx);
    if (!memNo) throw new Error("no memNo — run `doLogin` first");
    console.log(`stores: ${stores.map((b) => `${b.value}(${b.storeCd})`).join(" · ")}`);

    const postJson = async (path: string, data: unknown, timeout = 60_000) => {
      const t0 = Date.now();
      const res = await page.request.post(
        `${SONO.apiBase}/${path}?lang=ko&deviceType=PC&mobileAppYn=N`,
        {
          timeout,
          headers: { "content-type": "application/json", Accept: "application/json", Referer: SONO.bookingUrl },
          data,
        },
      );
      const text = await res.text();
      let json: Entry | null = null;
      try {
        json = JSON.parse(text) as Entry;
      } catch {
        /* not json */
      }
      return { status: res.status(), ms: Date.now() - t0, bytes: text.length, json, text };
    };
    const describe = (r: Awaited<ReturnType<typeof postJson>>) => {
      const err = r.json?.error as Entry | string | undefined;
      const errText = err
        ? typeof err === "string"
          ? err
          : `${str(err, "code") || str(err, "errorId")} ${str(err, "message") || str(err, "errorMsg") || str(err, "msg")}`.trim()
        : "";
      return `HTTP ${r.status} · ${r.ms}ms · ${r.bytes}B · success=${String(r.json?.success)}` +
        (errText ? ` · error=${errText.slice(0, 120)}` : "");
    };
    const entriesOf = (json: Entry | null): Entry[] =>
      ((json?.body ?? []) as Entry[]).flatMap((s) => (s.rmTypeList ?? []) as Entry[]);
    // `room/detail`은 한 층 더 깊다: body[](객실유형) > viewList[] > rmTypeList[].
    // 2026-09-13 첫 실행은 이걸 `entriesOf`로 세어 **열린 콜을 "안 열림"으로 판정**했다
    // (10KB 200 success=true에 leaves=0). 모양을 모르는 채 센 0은 '없다'가 아니다.
    const detailLeavesOf = (json: Entry | null): Entry[] =>
      ((json?.body ?? []) as Entry[]).flatMap((r) =>
        ((r.viewList ?? []) as Entry[]).flatMap((v) => (v.rmTypeList ?? []) as Entry[]),
      );

    const listPc = async (checkin: Date, nights: number, storeCds: string[], rmTypeCode = "") => {
      const r = await postJson("memberReservation/room/list/pc", {
        memNo,
        ...SONO.request,
        ciYmd: formatDateCompact(checkin),
        coYmd: formatDateCompact(addDaysUtc(checkin, nights)),
        nights,
        storeCdList: storeCds,
        rmTypeCode,
      });
      return { ...r, entries: entriesOf(r.json) };
    };

    const today = parseDate(todayKstIso());
    const storeCds = stores.map((b) => b.storeCd);
    // 2박으로 묻는다: 응답은 그 달 전체 + nights-1일 꼬리라 1박의 상위집합이고,
    // Part 2의 2박 판정 비교에 월말 하루가 필요하다.
    const A = await listPc(addDaysUtc(today, 14), 2, storeCds);
    const B = await listPc(addDaysUtc(today, 45), 2, storeCds);
    console.log(`\nlist/pc  이번 달: ${describe(A)} · ${A.entries.length} entries`);
    console.log(`list/pc  다음 달: ${describe(B)} · ${B.entries.length} entries`);
    if (!A.entries.length) throw new Error("이번 달 응답에 엔트리가 없다 — 날짜·세션을 확인할 것");

    const roomTypeOf = (e: Entry) => [str(e, "resortTypeNm"), str(e, "roomTypeNm")].filter(Boolean).join(" ");
    const groupKey = (e: Entry) => `${str(e, "storeCd")}|${roomTypeOf(e)}`;
    const CODE_KEYS = ["viewCd", "pyeongCd", "rmTypeCd", "roomTypeCd", "resortTypeCd", "levelYn"];

    // ── Part 1 ──────────────────────────────────────────────────────────────
    try {
      const groups = new Map<string, Entry[]>();
      for (const e of A.entries) groups.set(groupKey(e), [...(groups.get(groupKey(e)) ?? []), e]);
      console.log(`\n\n=== Part 1 · (지점, 객실유형)별 코드 census — ${A.entries.length} entries · ${groups.size} groups ===`);
      keyCensus("body[].rmTypeList[] — 15키 재확인", A.entries.slice(0, 400));
      for (const [g, rows] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
        const variants = new Set(rows.map((r) => str(r, "rmTypeCd"))).size;
        console.log(`\n  ${g}  (${rows.length} entries · ${variants} rmTypeCd)`);
        for (const k of CODE_KEYS) console.log(`      ${k.padEnd(13)} ${valueAlphabet(rows.map((r) => r[k]))}`);
      }

      console.log("\n  --- viewCd → 어느 지점·객실유형에 나오나 (전역 어휘인가 지점별인가) ---");
      const viewIndex = new Map<string, { stores: Set<string>; rooms: Set<string>; n: number }>();
      for (const e of A.entries) {
        const v = str(e, "viewCd");
        const x = viewIndex.get(v) ?? { stores: new Set(), rooms: new Set(), n: 0 };
        x.stores.add(str(e, "storeCd"));
        x.rooms.add(str(e, "roomTypeNm"));
        x.n++;
        viewIndex.set(v, x);
      }
      for (const [v, x] of [...viewIndex].sort((a, b) => a[0].localeCompare(b[0]))) {
        console.log(
          `    viewCd=${JSON.stringify(v).padEnd(8)} ×${String(x.n).padStart(5)}  stores={${[...x.stores].join(",")}}  rooms=${[...x.rooms].slice(0, 6).join(" · ")}`,
        );
      }
      const crossStore = [...viewIndex.values()].filter((x) => x.stores.size > 1).length;
      console.log(
        `  → viewCd ${viewIndex.size}종, 그중 ${crossStore}종이 둘 이상의 지점에 나온다.` +
          (viewIndex.size <= 12 && crossStore > 0
            ? " 짧은 전역 어휘로 보인다 — 이름표 키 후보 = viewCd (단, 같은 코드가 지점마다 다른 뷰를 뜻할 수 있으니 Part 4/헤드 브라우저로 이름을 대조할 것)."
            : " 지점마다 갈린다 — 이름표 키 = `${storeCd}:${viewCd}`."),
      );

      const pyeongMixed = [...groups].filter(([, rows]) => new Set(rows.map((r) => str(r, "pyeongCd"))).size > 1);
      console.log(`\n  pyeongCd가 섞인 그룹: ${pyeongMixed.length}/${groups.size}` + (pyeongMixed.length ? "  ← 접기 키 가정이 깨졌다. 라벨에 평형을 더해야 한다" : "  (08-31과 같다 — 접힘은 뷰 축뿐)"));
      for (const [g, rows] of pyeongMixed.slice(0, 6)) console.log(`      ${g}: pyeongCd=${valueAlphabet(rows.map((r) => r.pyeongCd))}`);
    } catch (e) {
      console.log("!!! Part 1 실패:", e instanceof Error ? e.message : e);
    }

    // ── Part 2 ──────────────────────────────────────────────────────────────
    try {
      console.log("\n\n=== Part 2 · rmTypeCd의 정체와 안정성 ===");
      const tupleOf = (e: Entry) => [str(e, "storeCd"), str(e, "roomTypeCd"), str(e, "viewCd"), str(e, "pyeongCd")].join("|");
      const byRm = new Map<string, Set<string>>();
      const byTuple = new Map<string, Set<string>>();
      const rmStores = new Map<string, Set<string>>();
      for (const e of [...A.entries, ...B.entries]) {
        const rm = `${str(e, "storeCd")}|${str(e, "rmTypeCd")}`;
        byRm.set(rm, (byRm.get(rm) ?? new Set()).add(tupleOf(e)));
        byTuple.set(tupleOf(e), (byTuple.get(tupleOf(e)) ?? new Set()).add(str(e, "rmTypeCd")));
        rmStores.set(str(e, "rmTypeCd"), (rmStores.get(str(e, "rmTypeCd")) ?? new Set()).add(str(e, "storeCd")));
      }
      const rmMulti = [...byRm].filter(([, t]) => t.size > 1);
      const tupleMulti = [...byTuple].filter(([, r]) => r.size > 1);
      const rmShared = [...rmStores].filter(([, s]) => s.size > 1).length;
      console.log(`  (지점, rmTypeCd) → (roomTypeCd, viewCd, pyeongCd) 가 함수인가: 위반 ${rmMulti.length}/${byRm.size}`);
      for (const [rm, t] of rmMulti.slice(0, 5)) console.log(`      ${rm} → ${[...t].join(" / ")}`);
      console.log(
        `  역방향 (roomTypeCd, viewCd, pyeongCd) → rmTypeCd 가 1:1인가: 위반 ${tupleMulti.length}/${byTuple.size}` +
          (tupleMulti.length ? "  ← 한 뷰 안에 rmTypeCd가 여럿 = 세부 축이 이미 list/pc에 갈라져 있다. 라벨은 `${뷰} (${rmTypeCd})`" : ""),
      );
      for (const [t, rms] of tupleMulti.slice(0, 8)) console.log(`      ${t} → {${[...rms].join(", ")}}`);
      console.log(`  같은 rmTypeCd가 둘 이상의 지점에 나오는 수: ${rmShared}/${rmStores.size}  (0이면 rmTypeCd는 지점 안에서만 뜻이 있다)`);

      // 날짜별 변형 집합이 들쭉날쭉한가 — 2박 세부 목록에서 변형이 탈락하는 빈도.
      const perDate = new Map<string, Map<string, Set<string>>>();
      for (const e of A.entries) {
        const g = groupKey(e);
        const d = perDate.get(g) ?? new Map<string, Set<string>>();
        d.set(str(e, "ciYmd"), (d.get(str(e, "ciYmd")) ?? new Set()).add(str(e, "rmTypeCd")));
        perDate.set(g, d);
      }
      let ragged = 0;
      for (const [g, d] of perDate) {
        const sigs = new Set([...d.values()].map((set) => [...set].sort().join(",")));
        if (sigs.size > 1) {
          ragged++;
          if (ragged <= 5) console.log(`      ragged: ${g} — 날짜별 변형 집합 ${sigs.size}종 (${[...d.values()].map((s) => s.size).join(",")})`);
        }
      }
      console.log(`  이번 달 안에서 날짜마다 변형 집합이 다른 그룹: ${ragged}/${perDate.size}`);

      const unionOf = (entries: Entry[]) => {
        const m = new Map<string, Set<string>>();
        for (const e of entries) m.set(groupKey(e), (m.get(groupKey(e)) ?? new Set()).add(str(e, "rmTypeCd")));
        return m;
      };
      const uA = unionOf(A.entries);
      const uB = unionOf(B.entries);
      let drift = 0;
      for (const [g, setA] of uA) {
        const setB = uB.get(g);
        if (!setB) continue;
        if ([...setA].sort().join() !== [...setB].sort().join()) {
          drift++;
          if (drift <= 5) console.log(`      drift: ${g} — 이번 달 {${[...setA]}} vs 다음 달 {${[...setB]}}`);
        }
      }
      console.log(`  이번 달 ↔ 다음 달 변형 집합이 다른 그룹: ${drift}/${uA.size}`);

      // rmTypeCode 프로브 — 요청 필드는 있는데(항상 "") 무엇을 하는지 아무도 안 물어봤다.
      const probe = A.entries.find((e) => str(e, "storeCd") === stores[0].storeCd) ?? A.entries[0];
      const P = await listPc(addDaysUtc(today, 14), 1, [str(probe, "storeCd")], str(probe, "rmTypeCd"));
      const pRm = new Set(P.entries.map((e) => str(e, "rmTypeCd")));
      const baseRm = new Set(A.entries.filter((e) => str(e, "storeCd") === str(probe, "storeCd")).map((e) => str(e, "rmTypeCd")));
      console.log(
        `\n  rmTypeCode="${str(probe, "rmTypeCd")}" 프로브: ${describe(P)} · ${P.entries.length} entries · rmTypeCd {${[...pRm].join(",")}} (필터 없을 때 ${baseRm.size}종)` +
          (pRm.size === 1 && baseRm.size > 1 ? "  ← 변형 필터다" : pRm.size === baseRm.size ? "  ← 무시된다" : ""),
      );

      // ★ 2박: 접기 판정(밤마다 아무 변형이나 OR → AND) vs 변형 판정(한 변형이 두 밤 다).
      // 사이트는 rmTypeCd 하나로 전 숙박을 예약하므로 후자가 실제 예약 가능성이다.
      const OPEN = new Set(["A", "E"]);
      const bookable = (e: Entry) => OPEN.has(str(e, "rsvStatusCd")) && Number(e.rsvRmCnt ?? 0) > 0;
      const cal = new Map<string, Map<string, Map<string, Entry>>>();
      for (const e of A.entries) {
        const g = groupKey(e);
        const dates = cal.get(g) ?? new Map<string, Map<string, Entry>>();
        const night = dates.get(str(e, "ciYmd")) ?? new Map<string, Entry>();
        night.set(str(e, "rmTypeCd"), e);
        dates.set(str(e, "ciYmd"), night);
        cal.set(g, dates);
      }
      let rows2 = 0;
      let foldTrue = 0;
      let variantTrue = 0;
      let disagree = 0;
      const perStore = new Map<string, number>();
      for (const [g, dates] of cal) {
        for (const d of dates.keys()) {
          const d0 = parseDateCompact(d);
          if (!d0) continue;
          const n2 = dates.get(formatDateCompact(addDaysUtc(d0, 1)));
          if (!n2) continue;
          const n1 = dates.get(d)!;
          rows2++;
          const foldAvail = [...n1.values()].some(bookable) && [...n2.values()].some(bookable);
          const varAvail = [...n1.entries()].some(([rm, e]) => bookable(e) && n2.has(rm) && bookable(n2.get(rm)!));
          if (foldAvail) foldTrue++;
          if (varAvail) variantTrue++;
          if (foldAvail !== varAvail) {
            disagree++;
            const st = g.split("|")[0];
            perStore.set(st, (perStore.get(st) ?? 0) + 1);
            if (disagree <= 8) {
              const detail = [...n1.entries()].map(([rm, e]) => `${rm}:${str(e, "rsvStatusCd")}${str(e, "rsvRmCnt")}/${n2.get(rm) ? str(n2.get(rm)!, "rsvStatusCd") + str(n2.get(rm)!, "rsvRmCnt") : "-"}`);
              console.log(`      ${g} ${d}: fold=${foldAvail} variant=${varAvail}  [${detail.join(" ")}]`);
            }
          }
        }
      }
      console.log(
        `\n  ★ 2박 행 ${rows2}개 중 접기 판정 available=${foldTrue}, 변형 판정 available=${variantTrue}, **갈리는 행 ${disagree}**` +
          (disagree ? `  (지점별 ${[...perStore].map(([s, n]) => `${s}:${n}`).join(" ")})  ← 현재 parse.ts가 거짓 예약 가능으로 발행하는 행` : "  (이 표본에서는 접기도 틀리지 않았다)"),
      );
    } catch (e) {
      console.log("!!! Part 2 실패:", e instanceof Error ? e.message : e);
    }

    // ── Part 3 ──────────────────────────────────────────────────────────────
    let detailJson: Entry | null = null;
    let detailPost: string | null = null;
    let detailOpensStandalone = false;
    try {
      console.log("\n\n=== Part 3a · userinfo 전 필드 (마스킹) — 이용회원번호 후보 찾기 ===");
      const ui = await page.request.get(`${SONO.apiBase}/management/auth/userinfo?lang=ko&deviceType=PC&mobileAppYn=N`, {
        timeout: 20_000,
        headers: { Accept: "application/json" },
      });
      maskedShape("management/auth/userinfo", await ui.json());
    } catch (e) {
      console.log("!!! Part 3a 실패:", e instanceof Error ? e.message : e);
    }

    try {
      console.log("\n\n=== Part 3b · SPA 번들 스캔 — 코드표 엔드포인트 · room/detail 본문 빌더 ===");
      phase = "bundle";
      await page.goto(SITE.booking, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(6_000);
      await dismissLayers(page);
      const scriptUrls: string[] = await page.evaluate(() => {
        const fromTags = Array.from(document.scripts).map((s) => s.src);
        const fromPerf = performance.getEntriesByType("resource").map((e) => e.name);
        return Array.from(new Set(fromTags.concat(fromPerf))).filter((u) => /\.js(\?|$)/.test(u));
      });
      console.log(`  스크립트 ${scriptUrls.length}개`);
      const PATTERNS: Array<[string, RegExp]> = [
        ["viewCd", /viewCd/g],
        ["viewNm", /viewNm/g],
        ["pyeongNm", /pyeongNm/g],
        ["code-table", /\/(common|cmm|com|comm)\/code|cmmCode|comCode|codeList|grpCd|codeGrp|commonCode|getCode/g],
        ["이용회원번호", /이용회원번호|useMemNo|utilMemNo|usrMemNo|useCustNo|utlMemNo/g],
        ["room/detail", /room\/detail|\/detail\/price/g],
        ["W22M3S4", /W22M3S4/g],
      ];
      let totalHits = 0;
      for (const url of scriptUrls) {
        let text: string;
        try {
          text = await (await page.request.get(url, { timeout: 30_000 })).text();
        } catch {
          continue;
        }
        const hits: string[] = [];
        for (const [name, re] of PATTERNS) {
          re.lastIndex = 0;
          let m: RegExpExecArray | null;
          let n = 0;
          while ((m = re.exec(text)) && n < 6) {
            n++;
            hits.push(`  [${name}] …${text.slice(Math.max(0, m.index - 220), m.index + 220).replace(/\s+/g, " ")}…`);
          }
        }
        if (hits.length) {
          totalHits += hits.length;
          console.log(`\n--- ${url.slice(0, 150)} (${text.length}B) ---`);
          console.log(hits.join("\n"));
        }
      }
      console.log(`\n  번들 히트 ${totalHits}건`);
      const bootCalls = captures.filter((c) => c.phase === "bundle" && !/room\/list|management\/auth/.test(c.url));
      console.log(`  예약 화면 로드가 부른 JSON ${bootCalls.length}건:`);
      for (const c of bootCalls) console.log(`    ${c.status} ${c.method} ${c.url.slice(0, 140)} (${c.body.length}B)`);
    } catch (e) {
      console.log("!!! Part 3b 실패:", e instanceof Error ? e.message : e);
    }

    try {
      console.log("\n\n=== Part 3c · room/detail 재현 ===");
      const manual = process.env.SONO_FLOW_MANUAL === "1";
      const isDetail = (c: Capture) => /memberReservation\/room\/detail(\?|$)/.test(c.url) && c.status === 200;
      phase = "search";
      await page.goto(SITE.home, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(4_000);
      await dismissLayers(page);

      if (manual) {
        const waitMs = Number(process.env.NET_WAIT_MS ?? 180_000);
        phase = "manual";
        console.log(">>> 브라우저에서 지점·날짜를 고르고 검색한 뒤 **예약 가능한 객실을 클릭**해 객실 선택 화면까지 들어가세요.");
        console.log(`>>> ${Math.round(waitMs / 1000)}초 기록합니다 (room/detail 200이 잡히면 바로 넘어갑니다).`);
        const until = Date.now() + waitMs;
        while (Date.now() < until && !captures.some(isDetail)) await page.waitForTimeout(2_000);
      } else {
        const storeLabel = stores[0].value;
        try {
          await page.getByRole("button", { name: "지역 또는 숙소 선택" }).first().click({ timeout: 10_000 });
          await page.waitForTimeout(2_500);
          await page.getByText(storeLabel, { exact: true }).first().click({ timeout: 8_000 });
          await page.waitForTimeout(2_000);
          await page.getByRole("button", { name: "검색", exact: true }).first().click({ timeout: 8_000 });
          await page.waitForTimeout(10_000);
          console.log(`  검색 실행: ${storeLabel}`);
        } catch (e) {
          console.log("  자동 검색 실패:", e instanceof Error ? e.message.slice(0, 160) : e);
        }
        phase = "roomclick";
        for (let hop = 1; hop <= 6 && !captures.some(isDetail); hop++) {
          const target = context.pages()[context.pages().length - 1];
          await dismissLayers(target).catch(() => undefined);
          const before = captures.length;
          const modalOk = target.getByRole("button", { name: /^(확인|예|진행)$/ }).filter({ visible: true }).first();
          const dayCell = target.locator("div.calendar td").filter({ hasText: /마감임박|예약가능/ }).first();
          // 달력 다음 화면 — 객실 카드/선택 버튼. 이름을 모르므로 넓게 잡고 첫 것을 누른다.
          const roomPick = target
            .getByRole("button", { name: /선택|예약하기|다음|계속|객실선택/ })
            .or(target.getByRole("link", { name: /선택|예약하기|다음|계속/ }))
            .or(target.locator("[class*=room] [class*=btn], [class*=roomList] button, li[class*=room]"))
            .filter({ visible: true })
            .first();
          let label = "";
          try {
            if (await modalOk.count()) {
              label = `모달 "${(await modalOk.textContent())?.trim().slice(0, 20)}"`;
              await modalOk.click({ timeout: 6_000 });
            } else if (await dayCell.count()) {
              label = `달력 셀 "${(await dayCell.textContent())?.trim().replace(/\s+/g, " ").slice(0, 30)}"`;
              await dayCell.click({ timeout: 6_000 });
            } else if (await roomPick.count()) {
              label = `객실/진행 "${(await roomPick.textContent())?.trim().replace(/\s+/g, " ").slice(0, 30)}"`;
              await roomPick.click({ timeout: 6_000 });
            } else {
              console.log(`  [hop ${hop}] 누를 것이 없습니다.`);
              await dump(target, `variants-hop${hop}`);
              console.log(await probeClickables(target).catch((e) => `  probe 실패: ${e}`));
              break;
            }
          } catch (e) {
            console.log(`  [hop ${hop}] 클릭 실패:`, e instanceof Error ? e.message.slice(0, 140) : e);
            break;
          }
          await page.waitForTimeout(6_000);
          const fresh = captures.slice(before);
          console.log(`  [hop ${hop}] ${label} → 새 JSON ${fresh.length}건: ${fresh.map((c) => `${c.status} ${endpointOf(c.url).split("/user/")[1] ?? c.url}`).join(" · ").slice(0, 400)}`);
        }
      }

      const cap = captures.find(isDetail);
      if (!cap) {
        console.log("\n  !!! room/detail 200을 잡지 못했다. 이것은 '없다'의 증거가 아니다 — 셀렉터 문제와 구별되지 않는다.");
        console.log("  !!! SONO_FLOW_MANUAL=1 NET_WAIT_MS=240000 CRAWLER_HEADLESS=false 로 손으로 몰 것.");
        const seenEp = [...new Set(captures.filter((c) => c.phase === "roomclick" || c.phase === "manual").map((c) => endpointOf(c.url)))];
        console.log(`  이 구간에 관측된 엔드포인트 ${seenEp.length}종:\n${seenEp.map((e) => `    ${e}`).join("\n")}`);
      } else {
        detailPost = cap.post;
        try {
          detailJson = JSON.parse(cap.body) as Entry;
        } catch {
          /* leave null */
        }
        const idx = captures.indexOf(cap);
        const before = captures.slice(0, idx).filter((c) => !/room\/list|management\/auth|management\/common/.test(c.url));
        console.log(`\n  ✔ SPA가 room/detail을 불렀다: ${cap.status} ${cap.ms}ms ${cap.body.length}B`);
        console.log(`    요청 본문: ${maskPost(cap.post)}`);
        console.log(`    요청 헤더 이름: ${cap.reqHeaders.join(", ")}`);
        console.log(`    그 앞의 콜 ${before.length}건 (뒤에서 8건):`);
        for (const c of before.slice(-8)) console.log(`      ${c.status} ${c.method} ${endpointOf(c.url).split("/user/")[1] ?? c.url}  body=${maskPost(c.post).slice(0, 200)}`);

        // 재생 ① 같은 컨텍스트 · 선행 콜 순서대로 → detail
        const SEQ = ["room/filter", "room/reserve/pre", "room/reserve/session/check"];
        const priors = SEQ.map((ep) => [...before].reverse().find((c) => c.url.includes(ep))).filter((c): c is Capture => !!c);
        console.log(`\n  재생 ① 선행 ${priors.length}콜 + detail (같은 컨텍스트)`);
        for (const c of priors) {
          const p = new URL(c.url).pathname.split("/user/")[1] ?? "";
          const r = await postJson(p, c.post ?? "{}", 30_000);
          console.log(`      ${p}: ${describe(r)}`);
        }
        const r1 = await postJson("memberReservation/room/detail", cap.post ?? "{}", 30_000);
        console.log(`      detail: ${describe(r1)}`);
        detailOpensStandalone = r1.status === 200 && r1.json?.success !== false && detailLeavesOf(r1.json).length > 0;
        if (!detailJson && detailOpensStandalone) detailJson = r1.json;

        // 재생 ② detail 단독 · 본문 보강
        console.log("\n  재생 ② detail 단독");
        const r2 = await postJson("memberReservation/room/detail", cap.post ?? "{}", 30_000);
        console.log(`      그대로: ${describe(r2)}`);
        let parsedPost: Entry = {};
        try {
          parsedPost = JSON.parse(cap.post ?? "{}") as Entry;
        } catch {
          /* keep {} */
        }
        const r2b = await postJson("memberReservation/room/detail", { ...parsedPost, memNo, userIndCd: SONO.request.userIndCd, rsvIndCd: SONO.request.rsvIndCd }, 30_000);
        console.log(`      + memNo/userIndCd/rsvIndCd: ${describe(r2b)}`);

        // 재생 ③ 새 컨텍스트(저장된 세션만, 네비게이션 없음)
        console.log("\n  재생 ③ 새 컨텍스트 — 쿠키만으로 열리는가");
        const ctx2 = await newContextFromState(browser, JSON.parse(readFileSync(STATE_FILE, "utf8")));
        try {
          const page2 = await ctx2.newPage();
          for (const c of priors) {
            const p = new URL(c.url).pathname.split("/user/")[1] ?? "";
            const res = await page2.request.post(`${SONO.apiBase}/${p}?lang=ko&deviceType=PC&mobileAppYn=N`, {
              timeout: 30_000,
              headers: { "content-type": "application/json", Accept: "application/json", Referer: SONO.bookingUrl },
              data: c.post ?? "{}",
            });
            console.log(`      ${p}: HTTP ${res.status()}`);
          }
          const res3 = await page2.request.post(`${SONO.apiBase}/memberReservation/room/detail?lang=ko&deviceType=PC&mobileAppYn=N`, {
            timeout: 30_000,
            headers: { "content-type": "application/json", Accept: "application/json", Referer: SONO.bookingUrl },
            data: cap.post ?? "{}",
          });
          const t3 = await res3.text();
          let j3: Entry | null = null;
          try {
            j3 = JSON.parse(t3) as Entry;
          } catch {
            /* not json */
          }
          console.log(`      detail: HTTP ${res3.status()} · ${t3.length}B · success=${String(j3?.success)} · entries=${entriesOf(j3).length}` + (j3?.error ? ` · error=${JSON.stringify(j3.error).slice(0, 120)}` : ""));
        } finally {
          await ctx2.close();
        }

        console.log("\n  판정표:");
        console.log(`    H1 선행 콜이 서버 세션 상태를 만든다 → 재생 ①이 열리고 ②가 닫히면 참`);
        console.log(`    H2 빠진 본문 필드 → ②에서 보강본만 열리면 참`);
        console.log(`    H3 SPA만 보내는 헤더 → 위 '요청 헤더 이름'에 우리가 안 보내는 이름이 있고 ①②③ 모두 닫히면 후보`);
        console.log(`    ③이 열리면 크롤러 세션(storageState)만으로 충분하다는 뜻이다`);
      }
    } catch (e) {
      console.log("!!! Part 3c 실패:", e instanceof Error ? e.message : e);
    }

    // ── Part 4 ──────────────────────────────────────────────────────────────
    try {
      if (!detailJson) {
        console.log("\n\n=== Part 4 · (room/detail 응답이 없어 건너뜀) ===");
      } else {
        console.log("\n\n=== Part 4 · room/detail 어휘와 조인 ===");
        envelopeKeys("room/detail", detailJson);
        const roomLevel: Entry[] = [];
        const viewLevel: Entry[] = [];
        const leaves: Entry[] = [];
        const walk = (v: unknown) => {
          if (Array.isArray(v)) {
            for (const x of v) walk(x);
            return;
          }
          if (!v || typeof v !== "object") return;
          const o = v as Entry;
          if (Array.isArray(o.viewList)) roomLevel.push(omit(o, "viewList"));
          if (Array.isArray(o.rmTypeList)) {
            viewLevel.push(omit(o, "rmTypeList"));
            for (const l of o.rmTypeList as Entry[]) leaves.push(l);
          }
          for (const val of Object.values(o)) if (val && typeof val === "object") walk(val);
        };
        walk(detailJson);
        keyCensus("room/detail → 객실유형 수준(viewList를 가진 객체)", roomLevel);
        keyCensus("room/detail → 뷰 수준(rmTypeList를 가진 객체)", viewLevel);
        keyCensus("room/detail → 말단 rmTypeList[]", leaves);
        if (!leaves.length) {
          const big = largestArray(detailJson);
          if (big) keyCensus(`room/detail → 가장 긴 배열 ${big.path}`, big.rows);
        }
        console.log("\n  --- 이름 필드 어휘와 null 비율 ---");
        for (const k of ["viewNm", "viewCd", "pyeongNm", "pyeongCd", "bedNm", "cookNm", "dongNm", "rmTypeNm", "rmTypeCd", "roomTypeNm", "groupRoomNameNm"]) {
          const pool = [...viewLevel, ...leaves].filter((o) => k in o);
          if (!pool.length) continue;
          const nulls = pool.filter((o) => o[k] == null || o[k] === "").length;
          console.log(`    ${k.padEnd(16)} in ${pool.length} objs · null/empty ${nulls} · ${valueAlphabet(pool.map((o) => o[k]))}`);
        }
        // 조인: 같은 지점·같은 날짜의 list/pc rmTypeCd 집합과 대조.
        let reqStore = "";
        let reqCi = "";
        try {
          const p = JSON.parse(detailPost ?? "{}") as Entry;
          reqStore = String((p.storeCdList as string[] | undefined)?.[0] ?? p.storeCd ?? "");
          reqCi = str(p, "ciYmd");
        } catch {
          /* unknown */
        }
        const dRm = new Set(leaves.map((l) => str(l, "rmTypeCd")).filter(Boolean));
        const lRm = new Set(
          [...A.entries, ...B.entries]
            .filter((e) => (!reqStore || str(e, "storeCd") === reqStore) && (!reqCi || str(e, "ciYmd") === reqCi))
            .map((e) => str(e, "rmTypeCd")),
        );
        const both = [...dRm].filter((x) => lRm.has(x)).length;
        console.log(`\n  조인 rmTypeCd — detail ${dRm.size}종 / list/pc(${reqStore || "?"}, ${reqCi || "?"}) ${lRm.size}종 / 교집합 ${both}` + (lRm.size === 0 ? "  (list/pc에 그 지점·날짜가 없어 판정 불가 — 조사 지점에 포함시켜 다시)" : ""));
        console.log(`    detail에만: {${[...dRm].filter((x) => !lRm.has(x)).join(",")}}  list/pc에만: {${[...lRm].filter((x) => !dRm.has(x)).join(",")}}`);
      }
    } catch (e) {
      console.log("!!! Part 4 실패:", e instanceof Error ? e.message : e);
    }

    // ── Part 5 ──────────────────────────────────────────────────────────────
    try {
      if (!detailOpensStandalone || !detailPost) {
        console.log("\n\n=== Part 5 · (page.request로 detail이 안 열려 비용 측정 건너뜀) ===");
      } else {
        console.log("\n\n=== Part 5 · room/detail 비용 — storeCdList 1 / 4 / 8 ===");
        const base = JSON.parse(detailPost) as Entry;
        const all = SONO.branches.map((b) => b.storeCd);
        for (const n of [1, 4, 8]) {
          const r = await postJson("memberReservation/room/detail", { ...base, storeCdList: all.slice(0, n) }, 60_000);
          const leaves = detailLeavesOf(r.json);
          const storesAnswered = new Set(((r.json?.body ?? []) as Entry[]).map((s) => str(s, "storeCd"))).size;
          const dates = [...new Set(leaves.map((l) => str(l, "ciYmd")).filter(Boolean))].sort();
          console.log(`    ${n}지점: ${describe(r)} · 답한 지점 ${storesAnswered} · 말단 ${leaves.length} · 날짜 ${dates.length}개 ${dates[0] ?? ""}→${dates[dates.length - 1] ?? ""}`);
        }
        console.log("  판단: 8지점을 한 콜에 답하고 날짜가 달 전체면 list/pc와 같은 4콜 구조 — 정기 수집에 들어간다.");
        console.log("        날짜가 ciYmd..coYmd뿐이면 지점×날짜 콜이라 리솜 요금처럼 '최신화'에서만 가능하다.");
      }
    } catch (e) {
      console.log("!!! Part 5 실패:", e instanceof Error ? e.message : e);
    }

    console.log("\n\n=== 세부 축 GO 조건(넷 다) ===");
    console.log(`  1. page.request로 DOM 없이 열린다(선행 콜 ≤3)   → ${detailOpensStandalone ? "예" : "아니오/미확인"}`);
    console.log("  2. 8지점/콜 또는 월 단위 응답(패스 +≤8초)        → Part 5");
    console.log("  3. rmTypeCd 조인 ≥99%                            → Part 4");
    console.log("  4. viewNm/bedNm/cookNm non-null ≥95%             → Part 4");
    console.log("  하나라도 아니면 뷰 축만 배선하고 실패한 기준을 AGENTS.md에 적는다.");
    console.log(`\n(JSON 왕복 ${captures.length}건 기록 · today=${todayKstIso()})`);
  } else if (step === "diff") {
    // Drift watchdog: the config list is the runtime source of truth, so the
    // only way it can rot is silently. Symptom would be "필터를 눌렀는데 0건",
    // indistinguishable from a crawl failure — hence this comparison.
    const { SONO } = await import("../src/crawlers/sono/config");
    await page.goto(urlArg ?? SITE.booking, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(6_000);
    await dismissLayers(page);
    const onSite = await page.locator("select option").evaluateAll((els) =>
      els.map((e) => (e.textContent ?? "").trim().replace(/\s+/g, " ")).filter(Boolean),
    );
    const configured = SONO.branches.map((b) => b.value);
    const missing = configured.filter((c) => !onSite.some((s) => s.includes(c) || c.includes(s)));
    const extra = onSite.filter((s) => !configured.some((c) => c.includes(s) || s.includes(c)));
    console.log("configured:", JSON.stringify(configured, null, 2));
    console.log("on site:", JSON.stringify(onSite, null, 2));
    console.log("in config but not on site:", JSON.stringify(missing));
    console.log("on site but not in config:", JSON.stringify(extra));
  } else {
    await page.goto(urlArg ?? SITE.home, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(6_000);
    await dismissLayers(page);
    await dump(page, "custom");
    await dumpInputs(page);
    await dumpButtons(page);
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
