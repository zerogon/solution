import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { BrowserContext, Page, Response } from "playwright-core";
import { launchBrowser, newContextFromState } from "../src/crawlers/_shared/browser";

/**
 * Site exploration helper for building the OAKVALLEY crawler (Phase F).
 *
 * A copy of `scripts/debug-resom.ts` rather than a generalization, for the same
 * reason that one was a copy of `debug-sono.ts`: each file's steps are the
 * narrative of one investigation, and they stay the tool for diagnosing that
 * resort's regressions later.
 *
 * What is already known (2026-08-11, before any login):
 * - **Two hosts.** Login lives on `oakvalley.co.kr` (a Vite/React SPA that
 *   POSTs `api.oakvalley.co.kr/api/v1/users/sign-in` and keeps the returned
 *   `access_token` in localStorage under `oak-token`). Availability lives on
 *   `reservation.oakvalley.co.kr` — a 2012-era JSP app (Tomcat `JSESSIONID`,
 *   jQuery 1.7.2) whose AJAX hits `*.pns` servlets. The SPA's 객실예약 button
 *   just does `window.location.href = p_entrance.jsp` with no token in the URL,
 *   so **how the second host learns we are logged in is the #1 question here**.
 * - `POST /condo.calendar.pns?getCalendar` is the availability call. Its
 *   response envelope is `{entitys, entitys2, errMsg, success, totalCount}` and
 *   `entitys[]` carries `{CD_DATE, WEEK_DAY, DAYS, AVA_YN, RM_RMTYPE, RM_REF1}`
 *   — a **day-of-month**, not a date, and a binary Y/N with no remaining count.
 *   **Corrected 2026-08-24**: that list is the six keys this crawler reads, not
 *   the six the response has. A census (`keys`) counts **14**: the six above
 *   plus `IMSI_SORT ORI_RM_DATE RM_COMPLEX RM_DATE RMTYPE_DESC ROOM_TYPE_CODE
 *   ROOM_TYPE_NAME SEC_DIV`. The conclusions still hold — no remaining count,
 *   no rate, `entitys2` empty — but they had been resting on a list nobody had
 *   actually counted.
 * - Every JSP `<form>` carries a server-generated hidden `ptSignature` that is
 *   `serialize()`d into each AJAX POST, so requests cannot be built from
 *   scratch the way `resom/search.ts` builds `calendarRooms`. Whether a
 *   harvested signature can be reused for later POSTs is what `cal` measures.
 * - `c_100.jsp` step 1 is 회원권 선택, and the calendar request carries
 *   `V_IN_MC_MEMNO` — a per-account dimension with no analogue in the other
 *   three crawlers.
 * - We collect **회원 콘도 예약 (CONDO) only** — 쿠폰/패키지(GRP1·GRP2)/성수기
 *   추첨(rslot) are different products and would not mean the same thing as the
 *   Lotte, SONO and RESOM rows they would sit next to.
 * - No bot protection was found (no netfunnel / Imperva / CAPTCHA / Cloudflare).
 *
 * Usage:
 *   CRAWLER_HEADLESS=false npx tsx scripts/debug-oakvalley.ts <step> [arg]
 *
 * Steps (in the order the survey wants them):
 *   main        entry point — header links, outbound hosts, the 객실예약 handler
 *   login       login form — inputs, clickables, aria snapshot (does NOT log in)
 *   doLogin     real login; token shape, localStorage keys, cookies WITH domains
 *   bridge      SPA → JSP handoff; session_yn per hop, calendar form fields,
 *               회원권 + complex options    ← decides login.ts's shape
 *   session     poll sessionCheck to find the JSESSIONID TTL
 *   cal         one getCalendar two ways (harvested-POST vs in-page $.ajax),
 *               plus the same signature re-fired 3×   ← decides the mechanism
 *   span        month scope, does V_IN_BAKSU matter, and the AND consistency
 *               probe                                 ← decides `InventoryRow.stay`
 *   keys        응답 키 전수 조사 (금액 조사 2026-08-24 · 정원 08-31)
 *   probe       어떤 오버라이드가 실제로 먹는가 — 서명이 붙은 폼의 판별법
 *   memberships do different 회원권 see different calendars?
 *   rows        run oakvalley/search.ts standalone (only after it exists)
 *   diff        compare the site's village/room-type lists against OAKVALLEY config
 *   axes        요금표를 행에 붙일 수 있는가 — 조인 키의 실측  ← 아래
 *
 * **`axes`가 존재하는 이유** (2026-08-26). 이 파일의 계보는 질문이 한 칸씩 넓어진
 * 기록이다: `cal`/`probe`가 "성공한 응답이 옳은 응답은 아니다", `keys`가 "우리가 읽는
 * 필드가 응답의 전부는 아니다". `axes`는 네 번째 질문이다 —
 * **"응답에 있는 값이 행에 붙일 수 있는 키는 아니다."**
 *
 * 계기는 `keys`가 "요금 없음"으로 닫아둔 문을 다른 쪽에서 연 것이다:
 * `GET api.oakvalley.co.kr/api/v1/village`(무인증)의 각 빌리지에 `roomPriceTable`이
 * 있고, 회원 요금표(기명/무기명/회원대여가 × 비수기/성수기/스페셜데이 × 주중/금/토)와
 * **시즌 달력 자체**(날짜 범위 + "토요일 요금 적용 일자" 예외 목록)가 HTML로 들어 있다.
 * 이 파일 머리말이 그 엔드포인트를 "재고가 없다"고만 적어둔 것은 사실이었고,
 * **요금은 아무도 묻지 않았다.**
 *
 * 그래서 남은 것은 수집이 아니라 조인이고, 조인을 막을 수 있는 것 셋을 여기서 잰다:
 *   1. 우리 `roomType`은 `OAKVALLEY.roomTypes[RM_RMTYPE]` = `"31평"`인데 요금표에는
 *      `31평 (일반)`과 `31평 (노블)`이 따로 있고 **주중 기명가가 77,000 대 92,000**이다.
 *      사이트가 그 둘을 구별하는가, 아니면 한 예약 단위로 접는가.
 *   2. 기명 / 무기명 / 회원대여가 중 이 계정이 어느 열인가. 셋의 차이가 20~25%다.
 *   3. 시즌 달력이 힐스 빌리지의 블롭에만 있다 — 밸리에도 적용된다는 근거가 표 안에 있는가.
 *
 * 1이나 2가 답해지지 않으면 요금을 붙이지 않는다. 틀린 금액은 빈칸보다 나쁘다.
 *
 * Credentials: `OAKVALLEY_ID`/`OAKVALLEY_PW` env if set, otherwise the primary
 * ResortAccount from the DB — the same one `run.ts` uses, so the survey
 * exercises the real account rather than a lookalike.
 *
 * `doLogin` and `bridge` write the storage state to `${OUT}-state.json` and
 * every other step reuses it. Logging in once per survey rather than once per
 * step keeps us off the site's rate limiter — and a locked account is not a
 * hypothetical here: the Lotte survey produced a run of silent login failures
 * that were indistinguishable from a wrong password.
 */
const OUT = process.env.DEBUG_OUT ?? "/tmp/oakvalley-debug";
const STATE_FILE = `${OUT}-state.json`;

const SITE = {
  home: "https://oakvalley.co.kr",
  login: process.env.OAK_LOGIN_URL ?? "https://oakvalley.co.kr/account/login",
  api: "https://api.oakvalley.co.kr/api/v1",
  rsv: "https://reservation.oakvalley.co.kr",
  entrance:
    process.env.OAK_ENTRANCE_URL ??
    "https://reservation.oakvalley.co.kr/frontoffice/p_entrance.jsp",
  condo:
    process.env.OAK_CONDO_URL ??
    "https://reservation.oakvalley.co.kr/frontoffice/condo/c_100.jsp",
  sessionCheck: "https://reservation.oakvalley.co.kr/common.session.pns?sessionCheck",
  calendar: "https://reservation.oakvalley.co.kr/condo.calendar.pns?getCalendar",
};

/**
 * Login form, recovered from the SPA bundle (`/assets/index-*.js`) — the served
 * HTML is an empty `<div id="root">`, so these are unverified until the `login`
 * step renders the page.
 *
 * Everything is scoped to `form.login-form-wrapper` because the header renders
 * another control with the accessible name 로그인 — the same trap that made
 * RESOM's submit selector `a.login_btn` rather than a role query.
 */
const LOGIN_SEL = {
  id: process.env.OAK_ID_SEL ?? "form.login-form-wrapper input[placeholder='아이디']",
  pw: process.env.OAK_PW_SEL ?? "form.login-form-wrapper input[type='password']",
  submit: process.env.OAK_SUBMIT_SEL ?? "form.login-form-wrapper button[type='submit']",
};

/** The hidden form on c_100.jsp whose fields (incl. ptSignature) we harvest. */
const CAL_FORM = process.env.OAK_CAL_FORM ?? "#data_param_calendar";

async function resolveCredentials(): Promise<{ id: string; pw: string }> {
  if (process.env.OAKVALLEY_ID && process.env.OAKVALLEY_PW) {
    return { id: process.env.OAKVALLEY_ID, pw: process.env.OAKVALLEY_PW };
  }
  const { prisma } = await import("../src/lib/prisma");
  const { decrypt } = await import("../src/lib/crypto");
  const resort = await prisma.resort.findUnique({ where: { slug: "OAKVALLEY" } });
  if (!resort) throw new Error("OAKVALLEY resort row missing — run npm run db:seed");
  const account = await prisma.resortAccount.findFirst({
    where: { resortId: resort.id, isPrimary: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!account) {
    throw new Error(
      "No primary OAKVALLEY ResortAccount. Add one at /admin/accounts, or set OAKVALLEY_ID/OAKVALLEY_PW.",
    );
  }
  return { id: decrypt(account.idEncrypted), pw: decrypt(account.pwEncrypted) };
}

/**
 * Accept every native dialog and keep what it said.
 *
 * The JSP app uses `alert()` and `$.j_alert` liberally. An unhandled dialog
 * blocks `page.evaluate` and every navigation *forever*, and the symptom is a
 * step that produces no output — which reads like a network stall rather than a
 * modal. Arm this before the first `goto` in every step.
 *
 * The text is worth keeping, not just dismissing: "회원권을 선택한 후 진행해
 * 주십시오" is often the only explanation an empty response will ever give.
 */
function armDialogs(page: Page): string[] {
  const messages: string[] = [];
  page.on("dialog", async (d) => {
    messages.push(`${d.type()}: ${d.message().trim().replace(/\s+/g, " ")}`);
    console.log(`[dialog] ${d.type()}: ${d.message().trim().replace(/\s+/g, " ")}`);
    await d.accept().catch(() => undefined);
  });
  return messages;
}

/**
 * Save mid-step, not only in `doLogin`.
 *
 * The JSP session is minted by the bridge, not by sign-in, so a state saved
 * before the bridge has no `JSESSIONID` and is useless to every later step.
 */
async function saveState(context: BrowserContext, why: string) {
  writeFileSync(STATE_FILE, JSON.stringify(await context.storageState(), null, 2));
  console.log(`[state] saved ${STATE_FILE} (${why})`);
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

async function dumpClickables(page: Page, limit = 40) {
  const clickables = await page
    .locator("button, a, [role='button'], [class*='btn'], input[type='submit']")
    .evaluateAll((els) =>
      els
        .map((e) => ({
          tag: e.tagName,
          text: (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30),
          cls: (e.getAttribute("class") ?? "").slice(0, 60),
          type: e.getAttribute("type"),
          href: e.getAttribute("href"),
          onclick: (e.getAttribute("onclick") ?? "").slice(0, 80),
          visible: (e as HTMLElement).offsetParent !== null,
        }))
        .filter((o) => o.visible && (o.text || o.type === "submit")),
    );
  console.log("clickables:", JSON.stringify(clickables.slice(0, limit), null, 2));
}

/** Every `<form>` with its action/method and its field names. */
async function dumpForms(page: Page, redact = /signature/i) {
  const forms = await page.locator("form").evaluateAll(
    (els, redactSrc) => {
      const re = new RegExp(redactSrc, "i");
      return els.map((f) => ({
        id: f.getAttribute("id"),
        name: f.getAttribute("name"),
        action: f.getAttribute("action"),
        method: f.getAttribute("method"),
        fields: [...(f as HTMLFormElement).elements].map((el) => {
          const name = el.getAttribute("name") ?? "";
          const value = (el as HTMLInputElement).value ?? "";
          return `${name}=${re.test(name) ? `<${value.length} chars>` : value.slice(0, 40)}`;
        }),
      }));
    },
    redact.source,
  );
  console.log("forms:", JSON.stringify(forms, null, 2));
}

/** Every `<select>` with its options — where 회원권 and complex live. */
async function dumpSelects(page: Page) {
  const selects = await page.locator("select").evaluateAll((els) =>
    els.map((s) => ({
      id: s.getAttribute("id"),
      name: s.getAttribute("name"),
      visible: (s as HTMLElement).offsetParent !== null,
      options: [...(s as HTMLSelectElement).options].map(
        (o) => `${o.value} | ${o.text.trim().replace(/\s+/g, " ").slice(0, 40)}`,
      ),
    })),
  );
  console.log("selects:", JSON.stringify(selects, null, 2));
}

/** Attach a JSON-response recorder; returns the accumulator to print later. */
function recordJson(page: Page) {
  const calls: { line: string; url: string }[] = [];
  const noise =
    /google|facebook|doubleclick|kakao|naver|criteo|analytics|gtm|hotjar|clarity|digicert/i;
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

/** Record full request/response bodies for anything that looks like inventory. */
function recordPayloads(page: Page, wanted: RegExp) {
  const payloads: { method: string; url: string; post: string | null; body: string }[] = [];
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
  return payloads;
}

function printPayloads(payloads: ReturnType<typeof recordPayloads>) {
  console.log("\n=== payloads ===");
  for (const p of payloads) {
    console.log(`\n### ${p.method} ${p.url}`);
    if (p.post) console.log("request:", p.post.slice(0, 2_000));
    console.log("response:", p.body.slice(0, Number(process.env.API_MAX ?? 6_000)));
  }
}

/**
 * `GET common.session.pns?sessionCheck`, printed raw.
 *
 * Unauthenticated it answers `{"session":[{"session_yn":"N"}]}`. The "Y" form is
 * inferred, not observed — which is exactly why this prints the whole body
 * rather than a boolean. If `Y` never appears, `checkLoggedIn` needs a
 * different probe and we want to see what we actually got.
 */
async function sessionCheck(page: Page, label: string): Promise<string> {
  try {
    const res = await page.request.get(SITE.sessionCheck, {
      timeout: 15_000,
      headers: { Referer: SITE.condo },
    });
    const text = (await res.text()).trim();
    console.log(`[session:${label}] ${res.status()} ${text.slice(0, 200)}`);
    return text;
  } catch (e) {
    console.log(`[session:${label}] failed:`, e instanceof Error ? e.message : e);
    return "";
  }
}

/** Cookie names + domains. The domain is the point — a `.oakvalley.co.kr`
 *  cookie is how the SPA host could be authenticating the JSP host. */
async function dumpCookies(context: BrowserContext, label: string) {
  const cookies = await context.cookies();
  console.log(
    `cookies (${label}):`,
    JSON.stringify(
      cookies.map((c) => ({ name: c.name, domain: c.domain, path: c.path })),
      null,
      2,
    ),
  );
  return new Set(cookies.map((c) => `${c.domain}${c.name}`));
}

/**
 * Walk the SPA → JSP handoff and land on the condo booking page.
 *
 * `p_entrance.jsp` is a dispatcher: it POSTs a `condo_flag` to c_100.jsp
 * (CONDO / coupon / package / season all land on the same page; GRP1/GRP2 go to
 * the golf-package page instead). We only ever want CONDO.
 *
 * Tries the page's own controls first and falls back to synthesizing the POST,
 * because a hand-built form skips whatever JS the real control runs.
 */
async function gotoCondo(page: Page, opts: { verbose?: boolean } = {}) {
  await page.goto(SITE.entrance, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(2_000);
  if (opts.verbose) {
    await dump(page, "entrance");
    await dumpForms(page);
    await dumpClickables(page, 25);
  }

  if (page.url().includes("c_100.jsp")) return;

  // 1) the site's own control, if one is recognisably it
  const control = page
    .locator("a, button, [onclick]")
    .filter({ hasText: /콘도|객실|일반\s*예약/ })
    .first();
  if (await control.count().catch(() => 0)) {
    try {
      await Promise.all([
        page.waitForURL(/c_100\.jsp/, { timeout: 15_000 }),
        control.click({ timeout: 8_000 }),
      ]);
      console.log("[bridge] reached c_100.jsp via the page's own control");
      return;
    } catch {
      console.log("[bridge] the page's own control did not land on c_100.jsp");
    }
  }

  // 2) synthesize the dispatcher POST
  await page.evaluate(
    ({ action, flag }) => {
      const f = document.createElement("form");
      f.method = "POST";
      f.action = action;
      const i = document.createElement("input");
      i.type = "hidden";
      i.name = "condo_flag";
      i.value = flag;
      f.appendChild(i);
      document.body.appendChild(f);
      f.submit();
    },
    { action: SITE.condo, flag: "CONDO" },
  );
  await page.waitForLoadState("domcontentloaded", { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(2_000);
  console.log(`[bridge] after synthesized condo_flag=CONDO POST: ${page.url()}`);
}

/**
 * One harvested form field.
 *
 * `id` and `name` are NOT the same on this page and the difference is
 * load-bearing: `c_handler.js` addresses fields by **id** (`$("#V_IN_GUEST_TYPE")`)
 * while `serialize()` submits them by **name** (`GUEST_TYPE`). Setting the wrong
 * one produces a request the server accepts and answers wrongly.
 */
interface Field {
  name: string;
  id: string;
  value: string;
}

/** A membership certificate, as `getRoomMember` reports it. */
interface Membership {
  memNo: string;
  complexCd: string;
  roomTypeCd: string;
  guestType: string;
  cdRef1: string;
  cdRef5: string;
  guja: string;
  passport: string;
  desc: string;
}

interface CalForm {
  fields: Field[];
  /** The certificate form, needed to ask `getRoomMember` who we are. */
  certFields: Record<string, string>;
  memberships: Membership[];
}

async function harvestForm(page: Page, sel: string): Promise<Field[] | null> {
  return await page.evaluate((s) => {
    const form = document.querySelector(s) as HTMLFormElement | null;
    if (!form) return null;
    return [...form.elements]
      .map((el) => ({
        name: el.getAttribute("name") ?? "",
        id: el.getAttribute("id") ?? "",
        value: (el as HTMLInputElement).value ?? "",
      }))
      .filter((f) => f.name);
  }, sel);
}

/**
 * Harvest the calendar form (incl. `ptSignature`) and the account's 회원권 list.
 *
 * The memberships are NOT a `<select>` — the page asks
 * `common.bungyangmember.pns?getRoomMember` for them, posting the certificate
 * form. There is no dropdown to read, so the survey has to make the same call.
 */
async function harvestCalForm(page: Page): Promise<CalForm> {
  const fields = await harvestForm(page, CAL_FORM);
  if (!fields) {
    throw new Error(
      `${CAL_FORM} not found on ${page.url()} — the bridge did not land on the condo page`,
    );
  }
  const cert = await harvestForm(page, "#data_param_certificate");
  const certFields = Object.fromEntries((cert ?? []).map((f) => [f.name, f.value]));

  let memberships: Membership[] = [];
  if (cert) {
    const res = await page.request.post(`${SITE.rsv}/common.bungyangmember.pns?getRoomMember`, {
      timeout: 20_000,
      headers: { Referer: SITE.condo, "X-Requested-With": "XMLHttpRequest" },
      form: certFields,
    });
    const body = JSON.parse(await res.text()) as {
      entitys?: Array<Record<string, string>>;
    };
    memberships = (body.entitys ?? []).map((e) => ({
      memNo: e.MC_MEMNO ?? "",
      complexCd: e.MC_COMPLEX ?? "",
      roomTypeCd: e.MC_RMTYPE ?? "",
      guestType: e.GUEST_TYPE ?? "",
      cdRef1: e.CD_REF1 ?? "",
      cdRef5: e.CD_REF5 ?? "",
      guja: e.MC_GUJA ?? "",
      passport: e.MC_PASSPORT ?? "",
      desc: e.MEM_DESC ?? "",
    }));
  }

  return { fields, certFields, memberships };
}

/** Redacted view of the harvested fields — the signature is long and noisy. */
function printFields(fields: Field[]) {
  console.log(
    "calendar form fields (id | name = value):",
    JSON.stringify(
      fields.map(
        (f) =>
          `${f.id} | ${f.name} = ${/signature/i.test(f.name) ? `<${f.value.length} chars>` : f.value}`,
      ),
      null,
      2,
    ),
  );
}

/**
 * Membership summary with the account's own identifiers reduced to shapes.
 *
 * The survey prints these to stdout for diagnosis, but 회원권 numbers and the
 * company name are the customer's data — nothing here should end up in a commit
 * or a doc.
 */
function printMemberships(ms: Membership[]) {
  console.log(
    `memberships: ${ms.length}`,
    JSON.stringify(
      ms.map((m) => ({
        memNo: `…${m.memNo.slice(-4)}`,
        complexCd: m.complexCd,
        roomTypeCd: m.roomTypeCd,
        guestType: m.guestType,
        cdRef1: m.cdRef1,
        cdRef5: m.cdRef5,
      })),
      null,
      2,
    ),
  );
}

interface CalEntity {
  CD_DATE?: string | number;
  WEEK_DAY?: string | number;
  DAYS?: string | number;
  AVA_YN?: string;
  RM_RMTYPE?: string;
  RM_REF1?: string;
}
interface CalPayload {
  entitys?: CalEntity[];
  entitys2?: unknown[];
  errMsg?: string;
  errTitle?: string;
  message?: string;
  success?: boolean | string;
  totalCount?: number | string;
}

type CalQuery = {
  complexCd: string;
  year: number;
  month: number;
  baksu: number;
  membership?: Membership;
};

/**
 * The fields this query changes, keyed by **element id**.
 *
 * The certificate → calendar mapping is copied from `c_handler.js` (the block
 * that runs when a 회원권 is picked), not inferred: it sets `V_IN_CD_REF1`,
 * `V_IN_GUJA`, `V_IN_PASSPORT`, `V_IN_CD_REF5`, `V_IN_MC_MEMNO`,
 * `V_IN_MEMNER_NO`, `V_IN_GUEST_TYPE` and `V_IN_ROOM_JIJUNG_JM = "M"`.
 *
 * The month field is `id="V_T_MONTH" name="T_MONTH"` — id and name differ, and
 * that difference cost a whole measurement: overriding the *name* left the id
 * untouched, the form kept submitting the month it was rendered with, and the
 * calendar answered the same month no matter what year/month we asked for. The
 * page's own `resetDate()` sets all three (`V_IN_YEAR`, `V_IN_MONTH`,
 * `V_T_MONTH`), so this does too.
 */
function calOverridesById(q: CalQuery): Record<string, string> {
  const mm = String(q.month).padStart(2, "0");
  const m = q.membership;
  return {
    V_IN_COMPLEX: q.complexCd,
    V_IN_YEAR: String(q.year),
    V_IN_MONTH: mm,
    V_T_MONTH: `${q.year}${mm}`,
    V_IN_BAKSU: String(q.baksu),
    ...(m
      ? {
          V_IN_MC_MEMNO: m.memNo,
          V_IN_MEMNER_NO: m.memNo,
          V_IN_CD_REF1: m.cdRef1,
          V_IN_CD_REF5: m.cdRef5,
          V_IN_GUJA: m.guja,
          V_IN_PASSPORT: m.passport,
          V_IN_GUEST_TYPE: m.guestType,
          V_IN_ROOM_JIJUNG_JM: "M",
        }
      : {}),
  };
}

/** Harvested form + id-keyed overrides → the name-keyed body that gets sent. */
function buildCalBody(form: CalForm, q: CalQuery): Record<string, string> {
  const byId = calOverridesById(q);
  const body: Record<string, string> = {};
  for (const f of form.fields) {
    body[f.name] = f.id in byId ? byId[f.id] : f.value;
  }
  return body;
}

/** Mechanism A: fire the harvested fields as a plain form POST. */
async function calViaPost(
  page: Page,
  form: CalForm,
  q: CalQuery,
): Promise<{ status: number; contentType: string; text: string }> {
  const res = await page.request.post(SITE.calendar, {
    timeout: 20_000,
    headers: {
      Referer: SITE.condo,
      "X-Requested-With": "XMLHttpRequest",
    },
    form: buildCalBody(form, q),
  });
  return {
    status: res.status(),
    contentType: res.headers()["content-type"] ?? "",
    text: await res.text(),
  };
}

interface EvalResult {
  ok?: boolean;
  data?: unknown;
  error?: string;
  body?: string;
}

/**
 * Mechanism B: set the live form's fields and let the page's own jQuery send it.
 *
 * Only the query fields are overridden — `serialize()` picks up the form's own
 * `ptSignature` and everything else, which is the whole point: the signature
 * cannot go stale because it is whatever the form currently holds.
 */
async function calViaEval(page: Page, formSel: string, q: CalQuery, url: string) {
  // Passed as a source STRING, not a function.
  //
  // tsx compiles with esbuild's `keepNames`, which rewrites named functions to
  // call a `__name` helper that only exists in the Node module scope. Playwright
  // serializes a callback with `toString()`, so that rewritten body reaches the
  // browser and dies on `ReferenceError: __name is not defined` — a failure of
  // the survey harness that looks exactly like a failure of the site.
  const src = `
    (async () => {
      const sel = ${JSON.stringify(formSel)};
      const over = ${JSON.stringify(calOverridesById(q))};
      const u = ${JSON.stringify(url)};
      const form = document.querySelector(sel);
      if (!form) return { error: sel + " missing" };
      // By id, the way c_handler.js does it — ids and submitted names differ here.
      for (const k in over) {
        const el = document.getElementById(k);
        if (el) el.value = over[k];
      }
      if (!window.$) return { error: "jQuery missing on page" };
      return await new Promise((resolve) => {
        window.$.ajax({
          url: u,
          type: "POST",
          data: window.$(sel).serialize(),
          dataType: "json",
          success: (d) => resolve({ ok: true, data: d }),
          error: (x) => resolve({
            error: "ajax " + (x && x.status),
            body: String((x && x.responseText) || "").slice(0, 500),
          }),
        });
      });
    })()`;
  return (await page.evaluate(src)) as EvalResult;
}

/** Parse + summarize one calendar response the same way for every mechanism. */
function summarizeCal(text: string): {
  payload: CalPayload | null;
  entities: number;
  dates: string[];
  roomTypes: string[];
  refs: string[];
  avaDist: Record<string, number>;
  byKey: Map<string, string>;
} {
  let payload: CalPayload | null = null;
  try {
    payload = JSON.parse(text) as CalPayload;
  } catch {
    /* not JSON — caller prints the raw text */
  }
  const entitys = payload?.entitys ?? [];
  const avaDist: Record<string, number> = {};
  const byKey = new Map<string, string>();
  for (const e of entitys) {
    const ava = String(e.AVA_YN ?? "");
    avaDist[ava] = (avaDist[ava] ?? 0) + 1;
    byKey.set(`${e.CD_DATE}|${e.RM_RMTYPE}|${e.RM_REF1 ?? ""}`, ava);
  }
  return {
    payload,
    entities: entitys.length,
    dates: [...new Set(entitys.map((e) => String(e.CD_DATE)))].sort(
      (a, b) => Number(a) - Number(b),
    ),
    roomTypes: [...new Set(entitys.map((e) => String(e.RM_RMTYPE ?? "")))].sort(),
    refs: [...new Set(entitys.map((e) => String(e.RM_REF1 ?? "")))].sort(),
    avaDist,
    byKey,
  };
}

function printCalSummary(label: string, text: string, extra?: string) {
  const s = summarizeCal(text);
  if (!s.payload) {
    console.log(`  ${label}: NOT JSON — ${text.slice(0, 300)}`);
    return s;
  }
  console.log(
    `  ${label}: success=${s.payload.success} errMsg="${s.payload.errMsg ?? ""}" ` +
      `totalCount=${s.payload.totalCount} entities=${s.entities}${extra ? ` ${extra}` : ""}`,
  );
  console.log(
    `    days=${s.dates.length} [${s.dates[0] ?? "-"}..${s.dates[s.dates.length - 1] ?? "-"}] ` +
      `roomTypes=${JSON.stringify(s.roomTypes)} refs=${JSON.stringify(s.refs.slice(0, 8))}`,
  );
  console.log(`    AVA_YN distribution: ${JSON.stringify(s.avaDist)}`);
  // RM_RMTYPE → RM_REF1, from real entities.
  //
  // This is the only trustworthy source for the 평형 of each room-type code:
  // c_handler.js contradicts itself about CE and DB (`room_type_fx()` maps
  // 037→CE and 045→DB, while the calendar renderer draws CE as room_45 and DB
  // as room_37). The data settles it, and a `roomType` that is part of the
  // upsert unique key cannot be renamed later.
  const pairs = new Map<string, Set<string>>();
  for (const e of s.payload.entitys ?? []) {
    const t = String(e.RM_RMTYPE ?? "");
    if (!pairs.has(t)) pairs.set(t, new Set());
    pairs.get(t)!.add(String(e.RM_REF1 ?? ""));
  }
  console.log(
    `    RM_RMTYPE → RM_REF1: ${JSON.stringify(
      Object.fromEntries([...pairs].map(([t, refs]) => [t, [...refs]])),
    )}`,
  );
  return s;
}

function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** Today in KST, as {year, month} — the survey's default calendar scope. */
function thisMonth(): { year: number; month: number } {
  const kst = new Date(Date.now() + 9 * 3_600_000);
  return { year: kst.getUTCFullYear(), month: kst.getUTCMonth() + 1 };
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

/** 공개 요금표 한 줄. `roomPriceTable`의 `<tr>` 하나를 셀 문자열 배열로 편 것. */
interface RateRow {
  cells: string[];
}

/**
 * `roomPriceTable`(HTML)을 셀 격자로 편다.
 *
 * 파서를 쓰지 않고 정규식으로 여는 이유는 이것이 **조사 스텝**이기 때문이다 — 여기서
 * 알고 싶은 것은 값이 아니라 *형태*이고, 형태를 모르는 채로 스키마를 씌우면 모르는
 * 것이 조용히 사라진다. 실제 수집기가 생긴다면 그때는 형태를 알고 시작한다.
 *
 * `rowspan`/`colspan`은 **펴지 않는다.** 이 표는 객실타입·요금구분이 rowspan으로 묶여
 * 있어서, 편 격자와 안 편 격자가 다르다는 사실 자체가 이 스텝의 관측 대상이다.
 */
function parseRateTable(html: string): RateRow[] {
  const rows: RateRow[] = [];
  for (const m of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      c[1]
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim(),
    );
    if (cells.length) rows.push({ cells });
  }
  return rows;
}

/** 공개 빌리지 API. 무인증이라 세션도 서명도 필요 없다. */
async function fetchVillages(page: Page): Promise<
  Array<{ title: string | null; villageType: string | null; priceTable: string }>
> {
  const res = await page.request.get("https://api.oakvalley.co.kr/api/v1/village", {
    headers: { Accept: "application/json" },
    timeout: 20_000,
  });
  if (!res.ok()) throw new Error(`village API HTTP ${res.status()}`);
  const body = (await res.json()) as {
    data?: Array<{
      introduceTitle?: string | null;
      oakValleyVillageType?: string | null;
      roomPriceTable?: string | null;
    }>;
  };
  return (body.data ?? []).map((v) => ({
    title: v.introduceTitle ?? null,
    villageType: v.oakValleyVillageType ?? null,
    priceTable: v.roomPriceTable ?? "",
  }));
}

async function main() {
  const step = process.argv[2] ?? "main";
  const urlArg = process.argv[3];
  const browser = await launchBrowser();
  const saved =
    step !== "doLogin" && existsSync(STATE_FILE)
      ? JSON.parse(readFileSync(STATE_FILE, "utf8"))
      : null;
  if (saved) console.log(`[state] reusing ${STATE_FILE}`);
  const context = await newContextFromState(browser, saved);
  const page = await context.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });
  const dialogs = armDialogs(page);

  if (step === "main") {
    await page.goto(urlArg ?? SITE.home, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(5_000);
    await dump(page, "main");
    await dumpClickables(page, 30);
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
    // Selectors only — this step must not spend a login attempt.
    await page.goto(urlArg ?? SITE.login, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(5_000);
    await dump(page, "login");
    await dumpInputs(page);
    await dumpClickables(page, 30);
    console.log("frames:", page.frames().map((f) => f.url().slice(0, 140)));
    for (const sel of Object.entries(LOGIN_SEL)) {
      const n = await page.locator(sel[1]).count().catch(() => -1);
      console.log(`selector ${sel[0]} (${sel[1]}) → ${n} match(es)`);
    }
    try {
      console.log("aria snapshot (login form):");
      console.log(await page.locator("form.login-form-wrapper").first().ariaSnapshot());
    } catch {
      console.log("(form.login-form-wrapper not found — falling back to the first form)");
      try {
        console.log(await page.locator("form").first().ariaSnapshot());
      } catch {
        console.log("(no form element at all)");
      }
    }
  } else if (step === "doLogin") {
    const { id, pw } = await resolveCredentials();
    console.log(
      `[login] using account "${id.slice(0, 2)}***" (${process.env.OAKVALLEY_ID ? "env" : "db"})`,
    );
    const calls = recordJson(page);
    // Where does the token come back, and under what shape? Keys only — the
    // values are the credential.
    page.on("response", async (res) => {
      if (!/users\/sign-in/.test(res.url())) return;
      try {
        const body = JSON.parse(await res.text()) as Record<string, unknown>;
        const shape = (o: unknown, d = 0): string =>
          o && typeof o === "object" && d < 3
            ? `{${Object.entries(o as Record<string, unknown>)
                .map(([k, v]) =>
                  v && typeof v === "object"
                    ? `${k}:${shape(v, d + 1)}`
                    : `${k}:${typeof v}${typeof v === "string" ? `(${v.length})` : ""}`,
                )
                .join(", ")}}`
            : "…";
        console.log(`[login] sign-in ${res.status()} response shape:`, shape(body));
      } catch {
        /* diagnostics only */
      }
    });

    const before = await dumpCookies(context, "before login");
    await page.goto(SITE.login, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(4_000);
    await page.locator(LOGIN_SEL.id).first().fill(id);
    await page.locator(LOGIN_SEL.pw).first().fill(pw);
    const signIn = page
      .waitForResponse(/users\/sign-in/, { timeout: 25_000 })
      .catch(() => null);
    try {
      await page.locator(LOGIN_SEL.submit).first().click({ timeout: 8_000 });
      console.log("[login] submitted via the form's submit button");
    } catch {
      await page.locator(LOGIN_SEL.pw).first().press("Enter");
      console.log("[login] submitted via Enter");
    }
    const res = await signIn;
    console.log(`[login] sign-in response: ${res ? `${res.status()} ${res.url()}` : "NONE SEEN"}`);
    await page.waitForTimeout(6_000);
    await dump(page, "after-login");

    // (a): does sign-in leave a cookie the JSP host could read?
    const after = await dumpCookies(context, "after login");
    console.log(
      "new cookies:",
      JSON.stringify([...after].filter((c) => !before.has(c))),
    );
    // Which localStorage keys the SPA wrote — `oak-token` is the expected one,
    // and storageState persists localStorage, so this is what a restored
    // session will carry.
    const ls = await page.evaluate(() =>
      Object.fromEntries(
        Object.keys(window.localStorage).map((k) => [
          k,
          (window.localStorage.getItem(k) ?? "").length,
        ]),
      ),
    );
    console.log("localStorage (key → value length):", JSON.stringify(ls, null, 2));

    // (f)/(a): is the JSP host authenticated by the SPA cookie ALONE, with no
    // navigation? This is the cheapest possible answer to the bridge question.
    await sessionCheck(page, "after sign-in, before any JSP navigation");

    await saveState(context, "post sign-in");
    console.log("json calls during login:\n" + calls.map((c) => c.line).join("\n"));
    console.log("dialogs:", JSON.stringify(dialogs));
    console.log("\n>>> next: npx tsx scripts/debug-oakvalley.ts bridge");
  } else if (step === "bridge") {
    // The pivotal step: it decides the SHAPE of oakvalley/login.ts, not just
    // its body. Print session_yn at every hop so a failure says which hop.
    const payloads = recordPayloads(page, /\.pns/);
    await sessionCheck(page, "hop0 — restored state, no JSP navigation");
    await dumpCookies(context, "hop0");

    await gotoCondo(page, { verbose: true });
    await sessionCheck(page, "hop2 — after landing on the condo page");
    await dumpCookies(context, "hop2");
    await dump(page, "condo");

    await dumpForms(page);
    await dumpSelects(page);
    const globals = await page.evaluate(() => ({
      jquery: typeof (window as unknown as { $?: unknown }).$,
      jqueryVersion:
        (window as unknown as { jQuery?: { fn?: { jquery?: string } } }).jQuery?.fn?.jquery ?? null,
      condo_calendar_search: typeof (
        window as unknown as { condo_calendar_search?: unknown }
      ).condo_calendar_search,
    }));
    console.log("page globals:", JSON.stringify(globals));

    try {
      const form = await harvestCalForm(page);
      printFields(form.fields);
      printMemberships(form.memberships);
      console.log(
        "distinct membership complexes:",
        JSON.stringify([...new Set(form.memberships.map((m) => m.complexCd))]),
      );
    } catch (e) {
      console.log("[harvest] failed:", e instanceof Error ? e.message : e);
    }

    await saveState(context, "post bridge");
    if (process.env.DUMP_PAYLOADS) printPayloads(payloads);
    console.log("dialogs:", JSON.stringify(dialogs));
  } else if (step === "session") {
    // (b): how long does the JSP session live? The answer decides whether
    // OAKVALLEY re-logins on nearly every 3-hour cron pass.
    const everyMs = Number(process.env.SESSION_EVERY_MS ?? 5 * 60_000);
    const rounds = Number(process.env.SESSION_ROUNDS ?? 12);
    console.log(
      `polling sessionCheck ${rounds}× every ${Math.round(everyMs / 60_000)}min ` +
        `(${Math.round((rounds * everyMs) / 60_000)}min total)`,
    );
    for (let i = 0; i < rounds; i++) {
      const t = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(11, 16);
      const text = await sessionCheck(page, `${t} KST +${Math.round((i * everyMs) / 60_000)}min`);
      if (text && !/"?session_yn"?\s*:\s*"Y"/.test(text)) {
        console.log(`>>> session died by +${Math.round((i * everyMs) / 60_000)}min`);
        break;
      }
      if (i < rounds - 1) await page.waitForTimeout(everyMs);
    }
  } else if (step === "cal") {
    // Decides the mechanism (§ptSignature) and, along the way, whether AVA_YN
    // has a third value that would give closingSoon something to stand on.
    await gotoCondo(page);
    await sessionCheck(page, "pre-cal");
    const form = await harvestCalForm(page);
    printFields(form.fields);
    printMemberships(form.memberships);

    const { year, month } = thisMonth();
    const complexCd = process.env.OAK_COMPLEX ?? "1101";
    const membership = form.memberships[0];
    const q: CalQuery = { complexCd, year, month, baksu: 1, membership };
    console.log(
      `\nquery: complex=${complexCd} ${year}-${String(month).padStart(2, "0")} baksu=1 ` +
        `membership=${membership ? `…${membership.memNo.slice(-4)} (complex ${membership.complexCd})` : "NONE"}`,
    );

    console.log("\n(1) mechanism A — harvested fields via page.request.post");
    const a1 = await calViaPost(page, form, q);
    console.log(`  http ${a1.status}  content-type: ${a1.contentType}`);
    // Legacy Tomcat + jQuery 1.7.2 makes EUC-KR plausible. The codes we parse
    // are ASCII, but a mangled label would decide whether room-type names come
    // from config or from the page.
    console.log(`  replacement chars in body: ${(a1.text.match(/�/g) ?? []).length}`);
    const sA = printCalSummary("A", a1.text);

    console.log("\n(2) is the harvested ptSignature reusable? (same signature ×3)");
    for (let i = 2; i <= 4; i++) {
      const again = await calViaPost(page, form, { ...q, baksu: 1 });
      printCalSummary(`A#${i}`, again.text, `http=${again.status}`);
    }

    console.log("\n(3) mechanism B — in-page $.ajax with the live form");
    const b = await calViaEval(page, CAL_FORM, q, SITE.calendar);
    if (b.error) {
      console.log(`  B failed: ${b.error} ${b.body ?? ""}`);
    } else {
      const sB = printCalSummary("B", JSON.stringify(b.data));
      let same = 0;
      let diff = 0;
      for (const [k, v] of sB.byKey) {
        const other = sA.byKey.get(k);
        if (other === undefined) continue;
        same++;
        if (other !== v) diff++;
      }
      console.log(`  A vs B: shared=${same} differing=${diff}`);
    }

    console.log("\nsample entities:");
    console.log(JSON.stringify((sA.payload?.entitys ?? []).slice(0, 6), null, 2));
    console.log("dialogs:", JSON.stringify(dialogs));
  } else if (step === "keys") {
    // 금액 조사, Oak Valley. This is the one resort whose payload keys are
    // already enumerated in full at the top of this file — so the honest
    // question here is not "what is in `entitys`" (we know) but the two things
    // that enumeration never covered:
    //
    //   1. `entitys2`, which the parser declares as `unknown[]` and never opens.
    //   2. whether a rate lives on a *different* servlet the crawler never calls.
    //
    // A "no rates here" verdict has to answer both, or it is just a narrower
    // claim wearing a wider one's clothes.
    // Q0 — 공개 마케팅 API. **로그인 전에 먼저 묻는다**(비용 0이고, 여기서 나온 답이
    // 2026-08-31의 정원 수집 전체다). 이 파일 머리말은 `/api/v1/village`와
    // `/api/v1/condo`를 "재고가 없다"고만 적어 두었는데, 그 문장에 이름조차 없던
    // `/api/v1/room`이 객실마다 `standardCount`/`maxCount`를 준다.
    // 파라미터 `idCondo`는 마케팅 SPA 번들의 `getRoomTypeList`에서 읽은 것이지
    // 추측이 아니다 — 틀린 이름은 전부 같은 400("콘도 정보가 누락되었습니다")이라
    // 이름이 틀린 것과 값이 틀린 것이 구별되지 않는다.
    const { OAKVALLEY } = await import("../src/crawlers/oakvalley/config");
    console.log("\n=== Q0. 공개 마케팅 API (무인증) ===");
    for (const [label, url] of [
      ["api/v1/village", OAKVALLEY.villageApiUrl],
      ["api/v1/condo", OAKVALLEY.condoApiUrl],
    ] as const) {
      const body = (await (await page.request.get(url, { timeout: 20_000 })).json()) as {
        data?: Array<Record<string, unknown>>;
      };
      keyCensus(label, body.data ?? []);
    }
    {
      const condos = (await (
        await page.request.get(OAKVALLEY.condoApiUrl, { timeout: 20_000 })
      ).json()) as { data?: Array<{ id?: number; name?: string; oakValleyVillageType?: string }> };
      const rooms: Array<Record<string, unknown>> = [];
      for (const c of condos.data ?? []) {
        const r = (await (
          await page.request.get(`${OAKVALLEY.roomApiUrl}?idCondo=${c.id}`, { timeout: 20_000 })
        ).json()) as { data?: Array<Record<string, unknown>> };
        for (const room of r.data ?? []) {
          rooms.push({ ...room, __village: c.oakValleyVillageType, __condo: c.name });
        }
      }
      keyCensus("api/v1/room?idCondo=… — 전 콘도의 객실", rooms);
      console.log("\n  정원 ↔ 우리 roomTypes 조인 (occupancy.ts가 하는 판정):");
      for (const room of rooms) {
        console.log(
          `    ${String(room.__village).padEnd(5)} ${String(room.__condo).slice(0, 18).padEnd(18)}` +
            ` ${String(room.name).slice(0, 22).padEnd(22)} std=${room.standardCount} max=${room.maxCount}`,
        );
      }
    }

    const pns = recordJson(page);
    await gotoCondo(page);
    await sessionCheck(page, "pre-keys");
    const form = await harvestCalForm(page);

    const { year, month } = thisMonth();
    const complexCd = process.env.OAK_COMPLEX ?? "1101";
    const membership = form.memberships[0];

    // Q1 — the calendar itself, censused rather than summarized.
    const first = await calViaPost(page, form, { complexCd, year, month, baksu: 1, membership });
    let payload: Record<string, unknown> | null = null;
    try {
      payload = JSON.parse(first.text) as Record<string, unknown>;
    } catch {
      console.log(`  calendar did not parse as JSON: ${first.text.slice(0, 300)}`);
    }
    if (payload) {
      envelopeKeys("condo.calendar.pns?getCalendar", payload);
      keyCensus("entitys[] — 1박", (payload.entitys ?? []) as Array<Record<string, unknown>>);
      // `entitys2` is declared `unknown[]` in parse.ts and opened by nobody.
      // If a rate rides anywhere in this response, this is where it hides.
      const second = (payload.entitys2 ?? []) as unknown[];
      console.log(`\n=== entitys2 — ${second.length} elements ===`);
      if (second.length) {
        keyCensus("entitys2[]", second as Array<Record<string, unknown>>);
      } else {
        console.log("  (empty — the parser's `unknown[]` was never hiding anything here)");
      }
    }

    // Q3 — 박수 changes nothing about availability (measured, see `span`).
    // Asked again of every numeric key, because "the calendar ignores 박수" and
    // "a rate ignores 박수" are different claims and only the first was tested.
    console.log("\n=== numeric keys across 1 / 2 / 3 박 (Q3) ===");
    const byBaksu = new Map<number, Array<Record<string, unknown>>>();
    byBaksu.set(1, ((payload?.entitys ?? []) as Array<Record<string, unknown>>));
    for (const baksu of [2, 3]) {
      const r = await calViaPost(page, form, { complexCd, year, month, baksu, membership });
      try {
        byBaksu.set(
          baksu,
          (JSON.parse(r.text) as { entitys?: Array<Record<string, unknown>> }).entitys ?? [],
        );
      } catch {
        byBaksu.set(baksu, []);
      }
    }
    const key = (e: Record<string, unknown>) => `${e.CD_DATE}|${e.RM_RMTYPE}`;
    const probe = (byBaksu.get(1) ?? [])[0];
    if (!probe) {
      console.log("  (no entities — nothing to compare)");
    } else {
      const numericKeys = [
        ...new Set(
          (byBaksu.get(1) ?? []).flatMap((e) =>
            Object.entries(e)
              .filter(([, v]) => asNumber(v) !== null)
              .map(([k]) => k),
          ),
        ),
      ];
      console.log(`  probe entity: ${key(probe)}`);
      for (const k of numericKeys) {
        const cells = [1, 2, 3].map((b) => {
          const hit = (byBaksu.get(b) ?? []).find((e) => key(e) === key(probe));
          return `${b}박=${hit ? String(hit[k]) : "-"}`;
        });
        console.log(`  ${k}: ${cells.join("  ")}`);
      }
    }

    // Q6 — rows are keyed by `RM_RMTYPE` alone. If two entities on one date
    // share a type and disagree, a rate could not be attributed to the row.
    console.log("\n=== same date + RM_RMTYPE, more than one entity (Q6) ===");
    const groups = new Map<string, Array<Record<string, unknown>>>();
    for (const e of byBaksu.get(1) ?? []) {
      groups.set(key(e), [...(groups.get(key(e)) ?? []), e]);
    }
    const collided = [...groups.entries()].filter(([, rows]) => rows.length > 1);
    for (const [k, rows] of collided.slice(0, 5)) {
      console.log(`  ${k} — ${rows.length}: ${JSON.stringify(rows).slice(0, 400)}`);
    }
    console.log(`  ${collided.length} of ${groups.size} (date, room type) pairs carry more than one entity`);

    // Q2 — every JSON call the condo screen made. A rate servlet the crawler
    // never asks for would be listed here and nowhere else.
    console.log("\n=== JSON calls the condo screen made (Q2) ===");
    console.log(pns.length ? pns.map((c) => `  ${c.line}`).join("\n") : "  (none)");
    console.log("dialogs:", JSON.stringify(dialogs));
  } else if (step === "span") {
    // The three measurements that decide `InventoryRow.stay`. Guessing here is
    // the exact mistake SONO made (available rows 6,379 → 5,720 once measured).
    await gotoCondo(page);
    const form = await harvestCalForm(page);
    const complexCd = process.env.OAK_COMPLEX ?? "1101";
    const membership = form.memberships[0];
    const { year, month } = thisMonth();
    const get = async (q: Partial<CalQuery>) =>
      summarizeCal(
        (await calViaPost(page, form, { complexCd, year, month, baksu: 1, membership, ...q })).text,
      );

    console.log("\n(1) M1 — what does one call cover?");
    for (const [y, m] of [
      [year, month],
      [month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1],
      [month >= 11 ? year + 1 : year, ((month + 1) % 12) + 1],
    ] as const) {
      const s = await get({ year: y, month: m });
      console.log(
        `  req ${y}-${String(m).padStart(2, "0")}  entities=${String(s.entities).padStart(5)}  ` +
          `days=${String(s.dates.length).padStart(3)}  [${s.dates[0] ?? "-"}..${s.dates[s.dates.length - 1] ?? "-"}]`,
      );
    }
    console.log(
      "  ← if days never exceed the month's length, there is NO tail past month end\n" +
        "    and parse.ts must merge month M and M+1 before building any 2박 row.",
    );

    console.log("\n(2) M2 — does V_IN_BAKSU change anything?");
    const base = await get({ baksu: 1 });
    let baksuMatters = false;
    for (const baksu of [2, 3]) {
      const other = await get({ baksu });
      let shared = 0;
      let differing = 0;
      for (const [k, v] of other.byKey) {
        const b = base.byKey.get(k);
        if (b === undefined) continue;
        shared++;
        if (b !== v) differing++;
      }
      if (differing > 0) baksuMatters = true;
      console.log(
        `  1박 vs ${baksu}박: shared=${shared} differing=${differing}` +
          (differing === 0
            ? "  ← baksu is ignored (the response is a calendar) → mode: per-night"
            : "  ← baksu MATTERS (the response answers the stay) → mode: per-stay"),
      );
    }

    console.log("\n(3) M3 — is the 2박 answer just the AND of two 1박 nights?");
    if (!baksuMatters) {
      // Comparing them anyway would produce a confident-looking verdict from a
      // comparison that cannot hold: with baksu ignored, the "2박 answer" IS the
      // 1박 answer, so it disagrees with the AND exactly wherever two adjacent
      // nights differ. That number describes the calendar, not the site's stay
      // logic. (It printed "disagree=12" on the first run and meant nothing.)
      console.log(
        "  skipped — M2 says baksu is ignored, so there is no separate 2박 answer\n" +
          "    to compare against. parse.ts must do the AND itself (per-night).",
      );
    } else {
      const two = await get({ baksu: 2 });
      let agree = 0;
      let disagree = 0;
      let unanswerable = 0;
      for (const [k, v] of two.byKey) {
        const [day, rmType, ref] = k.split("|");
        const n1 = base.byKey.get(`${day}|${rmType}|${ref}`);
        const n2 = base.byKey.get(`${Number(day) + 1}|${rmType}|${ref}`);
        if (n1 === undefined || n2 === undefined) {
          unanswerable++;
          continue;
        }
        const andOf = n1 === "Y" && n2 === "Y" ? "Y" : "N";
        if (andOf === v) agree++;
        else disagree++;
      }
      console.log(
        `  agree=${agree} disagree=${disagree} unanswerable=${unanswerable}` +
          (disagree === 0
            ? "  ← the site does the AND for us"
            : "  ← the site's stay answer is NOT the AND — trust the site, do not AND"),
      );
    }

    console.log("\n(4) contiguity across the month boundary");
    // The response has no tail past month end, so a 2박 check-in on the last day
    // of a month is only answerable if the next month's first day is present.
    // Verify the two months actually join with no gap and no overlap.
    const one = nextMonth(year, month);
    const m0 = await get({});
    const m1 = await get({ year: one.year, month: one.month });
    console.log(
      `  ${year}-${String(month).padStart(2, "0")}: days ${m0.dates[0]}..${m0.dates.at(-1)} (${m0.dates.length})  ` +
        `${one.year}-${String(one.month).padStart(2, "0")}: days ${m1.dates[0]}..${m1.dates.at(-1)} (${m1.dates.length})`,
    );
    console.log(
      `  room types identical across months: ${JSON.stringify(m0.roomTypes) === JSON.stringify(m1.roomTypes)}`,
    );
  } else if (step === "probe") {
    // Does an override actually reach the server?
    //
    // `ptSignature` is parameter-tampering protection, so "the request
    // succeeded" is NOT evidence that the request was honoured — a signed field
    // can be silently reverted to the value it was signed with. The first `span`
    // run looked like the calendar ignored the month, but the same evidence is
    // equally consistent with the month never having been changed at all.
    // Change one field at a time and see what moves.
    await gotoCondo(page);
    const form = await harvestCalForm(page);
    printFields(form.fields);
    const membership = form.memberships[0];
    const { year, month } = thisMonth();
    const base: CalQuery = { complexCd: "1101", year, month, baksu: 1, membership };

    const fingerprint = (s: ReturnType<typeof summarizeCal>) =>
      `days=${s.dates.length}[${s.dates[0] ?? "-"}..${s.dates.at(-1) ?? "-"}] ` +
      `types=${JSON.stringify(s.roomTypes)} ava=${JSON.stringify(s.avaDist)} n=${s.entities}`;

    const b = summarizeCal((await calViaPost(page, form, base)).text);
    console.log(`baseline            ${fingerprint(b)}`);

    const variants: Array<[string, CalQuery]> = [
      ["complex 2101       ", { ...base, complexCd: "2101" }],
      ["month +1           ", { ...base, ...nextMonth(year, month) }],
      [
        "month +2           ",
        (() => {
          const one = nextMonth(year, month);
          return { ...base, ...nextMonth(one.year, one.month) };
        })(),
      ],
      ["no membership      ", { ...base, membership: undefined }],
    ];
    for (const [label, q] of variants) {
      const s = summarizeCal((await calViaPost(page, form, q)).text);
      const moved = fingerprint(s) !== fingerprint(b);
      console.log(`${label} ${fingerprint(s)}  ${moved ? "← CHANGED" : "← identical (override ignored?)"}`);
    }

    // The one thing a signature cannot pin: the page's own state. Re-render the
    // condo page for a different month and harvest a NEW signature, then ask.
    // If this moves when the raw override did not, the month is part of what
    // ptSignature covers and the crawler must re-render per month.
    console.log("\nvia the page's own month navigation (fresh signature per month):");
    const nav = await page.evaluate(
      `(() => {
         const fns = Object.keys(window).filter((k) =>
           typeof window[k] === "function" && /month|calendar/i.test(k));
         return fns.slice(0, 40);
       })()`,
    );
    console.log("month/calendar-ish globals:", JSON.stringify(nav));
    const html = await page.content();
    writeFileSync(`${OUT}-c100.html`, html);
    console.log(`page html: ${OUT}-c100.html (${html.length} bytes)`);
  } else if (step === "memberships") {
    // (d)+(e): does the 회원권 axis change what we see? If it does, search.ts
    // has to iterate and OR-merge; if not, one membership is the whole answer.
    await gotoCondo(page);
    const form = await harvestCalForm(page);
    const { year, month } = thisMonth();
    printMemberships(form.memberships);
    if (form.memberships.length === 0) {
      console.log(
        ">>> none. search.ts must throw SEARCH_FAILED here rather than return 0 rows —\n" +
          "    0 rows is indistinguishable from a fully booked resort.",
      );
    }
    // Ask every membership about BOTH villages: these certificates are all for
    // one complex, so whether a membership can see the other village's calendar
    // is the question that decides if this account covers both branches at all.
    const complexes = (process.env.OAK_COMPLEXES ?? "1101,2101").split(",");

    // One baseline PER VILLAGE: the villages legitimately differ from each
    // other, so comparing a 힐스 answer against a 밸리 one would report a
    // difference that says nothing about memberships.
    const baseline = new Map<string, ReturnType<typeof summarizeCal>>();
    const probes: Array<{ membership?: Membership; label: string }> = [
      { membership: undefined, label: "no membership " },
      ...form.memberships
        .slice(0, Number(process.env.OAK_MEM_MAX ?? 4))
        .map((m) => ({ membership: m, label: `…${m.memNo.slice(-4)} (own ${m.complexCd})` })),
    ];
    for (const p of probes) {
      for (const complexCd of complexes) {
        const s = summarizeCal(
          (await calViaPost(page, form, { complexCd, year, month, baksu: 1, membership: p.membership }))
            .text,
        );
        const b = baseline.get(complexCd);
        let verdict = "  ← baseline";
        if (b) {
          let differing = 0;
          for (const [k, v] of s.byKey) if (b.byKey.get(k) !== v) differing++;
          const onlyHere = [...s.byKey.keys()].filter((k) => !b.byKey.has(k)).length;
          const onlyBase = [...b.byKey.keys()].filter((k) => !s.byKey.has(k)).length;
          verdict =
            differing === 0 && onlyHere === 0 && onlyBase === 0
              ? "  ← identical to baseline"
              : `  ← DIFFERS (differing=${differing} onlyHere=${onlyHere} onlyBase=${onlyBase})`;
        } else {
          baseline.set(complexCd, s);
        }
        console.log(
          `  ${p.label} → complex ${complexCd}: entities=${s.entities} days=${s.dates.length} ` +
            `types=${JSON.stringify(s.roomTypes)} ava=${JSON.stringify(s.avaDist)}${verdict}`,
        );
      }
    }
    console.log(
      "\n  If every row is 'identical to baseline', the 회원권 axis does not exist for\n" +
        "  availability and search.ts must NOT multiply its request count by it.",
    );
  } else if (step === "rows") {
    // Exercise oakvalley/search.ts + parse.ts standalone. Requires those files.
    // No cookie translation is needed (unlike RESOM): Oak Valley's auth is the
    // ordinary context cookies, so the saved state is already what the crawler
    // wants.
    const { performSearch } = await import("../src/crawlers/oakvalley/search");
    const { parseDate, todayKstIso, addDaysUtc } = await import("../src/lib/utils");
    const checkin = parseDate(todayKstIso());
    const nights = Number(process.env.OAK_NIGHTS ?? 1);
    const ctx = {
      resortId: "debug",
      slug: "oakvalley",
      context,
      page,
      credentials: { id: process.env.OAKVALLEY_ID ?? "", pw: process.env.OAKVALLEY_PW ?? "" },
      log: (msg: string, meta?: Record<string, unknown>) => console.log(msg, meta ?? ""),
      // 조사 스크립트에는 Vercel 60초 예산이 없다. 크롤러가 선택적 작업을
      // 포기하지 않도록 넉넉히 잡는다 — 여기서 재는 것은 시간이 아니라 동작이다.
      deadlineAt: Date.now() + 10 * 60_000,
    };
    const rows = await performSearch(ctx, {
      checkin,
      checkout: addDaysUtc(checkin, nights),
      ...(urlArg ? { branch: urlArg } : {}),
    });
    console.log(`rows: ${rows.length}`);
    console.log(JSON.stringify(rows.slice(0, 8), null, 2));
    const byBranch: Record<string, number> = {};
    for (const r of rows) byBranch[r.branchName] = (byBranch[r.branchName] ?? 0) + 1;
    console.log("per branch:", byBranch);
    console.log("regions:", JSON.stringify([...new Set(rows.map((r) => r.region))]));
    console.log("room types:", JSON.stringify([...new Set(rows.map((r) => r.roomType))]));
    console.log(
      "stay attribution:",
      JSON.stringify([...new Set(rows.map((r) => (r.stay ? "stay-stamped" : "requested-window")))]),
    );
    const { toIsoDate } = await import("../src/lib/utils");
    const checkins = [...new Set(rows.map((r) => (r.stay ? toIsoDate(r.stay.checkin) : "")))].sort();
    console.log(`distinct check-ins: ${checkins.length} [${checkins[0]}..${checkins.at(-1)}]`);
    console.log(
      `available=${rows.filter((r) => r.available).length} closingSoon=${rows.filter((r) => r.closingSoon).length} (closingSoon is deliberately always 0)`,
    );
  } else if (step === "axes") {
    // 조인 키의 실측. 순서가 곧 판정 순서다 — 앞이 부정이면 뒤는 볼 필요가 없다.

    // ── Q1. 공개 요금표: 형태부터 본다 (로그인 불필요) ─────────────────────
    console.log("=== Q1. 공개 요금표 (api/v1/village · 무인증) ===");
    const villages = await fetchVillages(page);
    const rateTypes = new Map<string, string[]>(); // village → 객실타입 문자열
    for (const v of villages) {
      const rows = parseRateTable(v.priceTable);
      console.log(
        `\n[${v.title ?? "(제목 없음)"} · ${v.villageType}] html=${v.priceTable.length}B rows=${rows.length}` +
          ` 시즌달력=${v.priceTable.includes("객실 상세 일정")} 토요일예외=${v.priceTable.includes("토요일 요금 적용")}`,
      );
      if (!rows.length) {
        console.log("  (요금표 없음)");
        continue;
      }
      // 헤더 두 줄과 그 아래 본문. 어디까지가 헤더인지도 관측 대상이라 앞 3줄을 그대로 낸다.
      for (const r of rows.slice(0, 3)) console.log(`  header? ${JSON.stringify(r.cells)}`);
      // 객실타입 후보 = 요금구분(기명/무기명/회원대여가/정상가)도 금액도 아닌 셀.
      const FARE = /^(기명|무기명|회원대여가?|정상가)$/;
      const MONEY = /^[\d,]+$/;
      const types = [
        ...new Set(
          rows
            .flatMap((r) => r.cells)
            .filter((c) => c && !FARE.test(c) && !MONEY.test(c) && c.length <= 24)
            .filter((c) => /평|룸|빌라|타워/.test(c)),
        ),
      ];
      rateTypes.set(v.title ?? "?", types);
      console.log(`  객실타입 후보(${types.length}): ${JSON.stringify(types)}`);
    }

    // ── Q2. 우리 행의 객실유형 축: 사이트가 일반/노블을 구별하는가 ──────────
    console.log("\n=== Q2. 달력 엔티티의 객실유형 축 (일반/노블을 가르는 필드가 있는가) ===");
    const { OAKVALLEY } = await import("../src/crawlers/oakvalley/config");
    const pnsAxes = recordJson(page);
    await gotoCondo(page);
    await sessionCheck(page, "pre-axes");
    const axForm = await harvestCalForm(page);
    const { year: axYear, month: axMonth } = thisMonth();

    const ROOM_KEYS = [
      "RM_RMTYPE",
      "RM_REF1",
      "RMTYPE_DESC",
      "ROOM_TYPE_CODE",
      "ROOM_TYPE_NAME",
      "SEC_DIV",
      "RM_COMPLEX",
    ] as const;

    for (const b of OAKVALLEY.branches) {
      const r = await calViaPost(page, axForm, {
        complexCd: b.complexCd,
        year: axYear,
        month: axMonth,
        baksu: 1,
        membership: axForm.memberships[0],
      });
      let ents: Array<Record<string, unknown>> = [];
      try {
        ents = (JSON.parse(r.text) as { entitys?: Array<Record<string, unknown>> }).entitys ?? [];
      } catch {
        console.log(`  ${b.value}: 응답이 JSON이 아니다 — ${r.text.slice(0, 200)}`);
        continue;
      }
      console.log(`\n[${b.value} · complexCd=${b.complexCd}] entitys=${ents.length}`);
      for (const k of ROOM_KEYS) {
        const vals = [...new Set(ents.map((e) => String(e[k] ?? "")).filter(Boolean))];
        console.log(`  ${k.padEnd(15)} ${vals.length}종 ${JSON.stringify(vals.slice(0, 12))}`);
      }
      // 결정적 질문: RM_RMTYPE 하나가 여러 이름/설명을 갖는가.
      // 갖는다면 사이트는 두 방을 **한 예약 단위로 접고 있고**, 요금은 하나가 아니라
      // 범위다. 안 갖는다면 그 필드가 곧 요금표 행을 고르는 키다.
      const byCode = new Map<string, Set<string>>();
      for (const e of ents) {
        const code = String(e.RM_RMTYPE ?? "");
        const label = `${e.RMTYPE_DESC ?? ""}|${e.ROOM_TYPE_NAME ?? ""}|${e.SEC_DIV ?? ""}`;
        if (!code) continue;
        (byCode.get(code) ?? byCode.set(code, new Set()).get(code)!).add(label);
      }
      const split = [...byCode].filter(([, set]) => set.size > 1);
      console.log(
        `  RM_RMTYPE → (DESC|NAME|SEC_DIV) 1:1 인가: ${split.length === 0 ? "예" : `아니오 — ${split.length}개 코드가 갈린다`}`,
      );
      for (const [code, set] of split) console.log(`    ${code}: ${JSON.stringify([...set])}`);

      // 그리고 우리 라벨이 요금표의 어느 줄에 붙는가.
      //
      // 접두사 매칭만으로는 부족하다. 밸리의 `NA`/`SE`는 우리 라벨이 "48평"·"52평"인데
      // 요금표는 "빌라 N 48평형"·"빌라 S 52평형"이라 접두사가 어긋나고, 그 대응을
      // 이어주는 것은 **평형이 아니라 동**(`SEC_DIV` = "N동"·"S동")이다. 그래서
      // 평(숫자)과 동 문자를 각각 뽑아 둘 다로 좁힌다 — 이 스텝이 재려는 것이 정확히
      // "무엇이 조인 키인가"이므로, 매처가 순진하면 못 붙는 것과 안 찾아본 것이 섞인다.
      const village = b.value.includes("힐스") ? "힐스 빌리지" : "밸리 빌리지";
      const candidates = rateTypes.get(village) ?? [];
      const dongOf = (code: string) => {
        const set = [...new Set(ents.filter((e) => e.RM_RMTYPE === code).map((e) => String(e.SEC_DIV ?? "")))];
        return set.length === 1 ? set[0].replace(/동$/, "") : null;
      };
      console.log(`  요금표(${village}) 대조:`);
      for (const [code, label] of Object.entries(OAKVALLEY.roomTypes)) {
        if (!byCode.has(code)) continue;
        const pyeong = String(label).match(/\d+/)?.[0];
        const dong = dongOf(code);
        // 1차: 평수가 같은 줄. 2차: 그중 동 문자를 포함하는 줄(있으면).
        const byPyeong = candidates.filter((c) => pyeong && c.includes(pyeong));
        const narrowed =
          dong && byPyeong.filter((c) => c.includes(dong)).length
            ? byPyeong.filter((c) => c.includes(dong))
            : byPyeong;
        console.log(
          `    ${code} → "${label}" (${dong ? dong + "동" : "동 미상"}) : ${narrowed.length}줄 ${JSON.stringify(narrowed)}` +
            (narrowed.length === 1 ? "" : narrowed.length === 0 ? "   ← 못 붙는다" : "   ← 모호하다"),
        );
      }
    }

    // ── Q3. 요금구분: 이 계정은 기명인가 무기명인가 ────────────────────────
    console.log("\n=== Q3. 회원권 — 요금표의 어느 열을 써야 하는가 ===");
    printMemberships(axForm.memberships);
    console.log(
      "  위 필드 중 기명/무기명을 말하는 것이 있는지 눈으로 판정할 것.\n" +
        "  없다면 요금표의 열을 우리가 고를 수 없고, 그때는 요금을 붙이지 않는다.",
    );
    console.log("\n=== 이 스텝이 지나며 본 JSON 호출 ===");
    for (const c of pnsAxes) console.log(`  ${c.line}`);
  } else if (step === "diff") {
    // Drift watchdog: OAKVALLEY.branches is the runtime source of truth for
    // `branchName`, so the only way it can rot is silently. The symptom would
    // be "필터를 눌렀는데 0건", indistinguishable from a crawl failure.
    const { OAKVALLEY } = await import("../src/crawlers/oakvalley/config");
    await gotoCondo(page);
    const form = await harvestCalForm(page);
    console.log(
      "configured:",
      JSON.stringify(OAKVALLEY.branches.map((b) => `${b.complexCd} ${b.value}`), null, 2),
    );
    printMemberships(form.memberships);

    // The public content API is a second opinion on the village list. It has no
    // availability, but it is where a newly released village would appear first
    // — the condo page has no village dropdown to compare against.
    const res = await page.request.get(`${SITE.api}/village`, { timeout: 15_000 });
    console.log(`\n/api/v1/village → ${res.status()}`);
    console.log((await res.text()).slice(0, Number(process.env.API_MAX ?? 4_000)));

    // Room-type codes churn in a way village names do not; a code we have never
    // seen shows up here as an unmapped bare code in `roomType`.
    const { year, month } = thisMonth();
    for (const b of OAKVALLEY.branches) {
      const s = summarizeCal(
        (
          await calViaPost(page, form, {
            complexCd: b.complexCd,
            year,
            month,
            baksu: 1,
            membership: form.memberships[0],
          })
        ).text,
      );
      const unmapped = s.roomTypes.filter(
        (c) => c && !(c in (OAKVALLEY.roomTypes as Record<string, unknown>)),
      );
      console.log(
        `${b.value}: seen=${JSON.stringify(s.roomTypes)} unmapped=${JSON.stringify(unmapped)}`,
      );
    }
  } else {
    await page.goto(urlArg ?? SITE.home, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(6_000);
    await dump(page, "custom");
    await dumpInputs(page);
    await dumpClickables(page);
  }

  await browser.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
