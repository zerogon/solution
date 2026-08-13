import "dotenv/config";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { BrowserContext, Page } from "playwright-core";
import { launchBrowser, newContextFromState } from "../src/crawlers/_shared/browser";

/**
 * Site exploration helper for the HANWHA crawler (Phase F).
 *
 * A copy of `scripts/debug-oakvalley.ts` rather than a generalization, for the
 * reason that one gives: each file's steps are the narrative of one
 * investigation, and they stay the tool for diagnosing that resort's
 * regressions later.
 *
 * What was already established before the crawler was written (2026-08-13):
 *
 * - **Two hosts.** `www.hanwharesort.co.kr` is the member site (JSP on JEUS);
 *   `booking.hanwharesort.co.kr` is a separate JEUS app holding every
 *   reservation flow behind one generic gateway, `POST /rst/cmn/doExecute.mvc`.
 * - **Login is two screens.** ID/password lands on
 *   `login_membership_password.do`, which demands the 회원권 비밀번호.
 *   `sessionCheck.do` answers `-1` until that is cleared and `0` after, so
 *   stopping at screen 1 yields a session that looks fine and sees the
 *   anonymous inventory.
 * - **`RSRV_CLDR_CL_CD` selects the member view.** At 설악 over 30 days, `02`
 *   showed 회원우선 240 / 예약가능 5 and `01` showed 예약가능 245.
 * - We collect **회원 객실 예약 only**. 추첨(lottery), 패키지, 쿠폰, 조식 and
 *   테마파크 are separate products; folding them in would make "잔여 객실" mean
 *   something different for this resort than for the other four.
 *
 * Usage:
 *   CRAWLER_HEADLESS=false npx tsx scripts/debug-hanwha.ts <step> [arg]
 *
 * Steps (in the order the survey wants them):
 *   main      entry point — outbound hosts, booking links
 *   login     login form — selectors only, spends no login attempt
 *   doLogin   the real two-screen login; saves the session
 *   bridge    hop-by-hop: does the booking host learn who we are, and where
 *   session   poll the session probe to find its TTL
 *   cal       record the member calendar's OWN request, then compare ours
 *             ← the step that proves we are asking the same question
 *   span      what one call covers · does the stay length matter · month edges
 *   rows      run hanwha/search.ts + parse.ts standalone
 *   diff      site property list and room types vs HANWHA config
 *
 * Credentials: `HANWHA_ID`/`HANWHA_PW`/`HANWHA_MEMBER_PW` env if set, otherwise
 * the primary ResortAccount from the DB — the same row `run.ts` uses, with the
 * 회원권 비밀번호 read from its memo, so the survey exercises the real path.
 *
 * `doLogin` writes the authenticated storage state to `${OUT}-state.json` and
 * every other step reuses it. Logging in once per survey keeps us off the
 * site's rate limiter, and repeated failures against a real account risk a
 * lock — the Lotte survey already produced a run of silent login failures
 * indistinguishable from a wrong password.
 *
 * One thing this file must never do: dump the 회원인증 page's HTML. That screen
 * carries `cyber_id` and `password` back in hidden fields, so saving its markup
 * writes plaintext credentials to disk.
 */
const OUT = process.env.DEBUG_OUT ?? "/tmp/hanwha-debug";
const STATE_FILE = `${OUT}-state.json`;

const SITE = {
  home: "https://www.hanwharesort.co.kr",
  login:
    process.env.HANWHA_LOGIN_URL ??
    "https://www.hanwharesort.co.kr/irsweb/resort3/member/login.do",
  sessionCheck: "https://www.hanwharesort.co.kr/irsweb/resort3/sessionCheck.do",
  booking: "https://booking.hanwharesort.co.kr",
  /** The booking-host page that mints its session and renders `sCustNo`. */
  entrance: "https://booking.hanwharesort.co.kr/rst/msi/0010/serviceM01.mvc",
  /** 잔여객실조회 — the screen whose request this crawler reproduces. */
  calendarPage: "https://booking.hanwharesort.co.kr/rst/rrs/0080/serviceM00.mvc",
  gateway: "https://booking.hanwharesort.co.kr/rst/cmn/doExecute.mvc",
  commonCode: "https://booking.hanwharesort.co.kr/rst/cmn/getCmnCode.mvc",
};

/** Property list service — the authority `diff` measures the config against. */
const PROPERTY_SERVICE = {
  INTF_ID: "TFO00HBSITSCTM0160",
  RECV_SVC_CD: "HBSITSCTM0160",
};

interface Creds {
  id: string;
  pw: string;
  memo: string;
}

async function resolveCredentials(): Promise<Creds> {
  if (process.env.HANWHA_ID && process.env.HANWHA_PW) {
    return {
      id: process.env.HANWHA_ID,
      pw: process.env.HANWHA_PW,
      memo: process.env.HANWHA_MEMBER_PW ?? "",
    };
  }
  const { prisma } = await import("../src/lib/prisma");
  const { decrypt } = await import("../src/lib/crypto");
  const resort = await prisma.resort.findUnique({ where: { slug: "HANWHA" } });
  if (!resort) throw new Error("HANWHA resort row missing — run npm run db:seed");
  const account = await prisma.resortAccount.findFirst({
    where: { resortId: resort.id, isPrimary: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!account) {
    throw new Error(
      "No primary HANWHA ResortAccount. Add one at /admin/accounts, or set HANWHA_ID/HANWHA_PW.",
    );
  }
  return {
    id: decrypt(account.idEncrypted),
    pw: decrypt(account.pwEncrypted),
    // The 회원권 비밀번호 lives in the account memo — see the grade note on
    // `CrawlerContext.credentials`.
    memo: (account.memo ?? "").trim(),
  };
}

/**
 * Accept every native dialog and keep the text.
 *
 * Arm this before the first `goto` in every step. The booking host is 2010s JSP
 * and uses `alert()` freely; one unhandled dialog freezes every later navigation
 * and `evaluate` permanently, and the symptom is "stopped with no output",
 * which reads like a network stall.
 */
function armDialogs(page: Page): string[] {
  const seen: string[] = [];
  page.on("dialog", async (d) => {
    seen.push(`${d.type()}: ${d.message()}`);
    await d.accept().catch(() => undefined);
  });
  return seen;
}

async function saveState(context: BrowserContext, why: string) {
  writeFileSync(STATE_FILE, JSON.stringify(await context.storageState(), null, 0));
  console.log(`[state] saved ${STATE_FILE} (${why})`);
}

async function dump(page: Page, label: string) {
  console.log(`\n--- ${label} ---`);
  console.log("url:", page.url());
  console.log("title:", await page.title().catch(() => "?"));
  await page.screenshot({ path: `${OUT}-${label}.png`, fullPage: true }).catch(() => undefined);
}

async function dumpInputs(page: Page) {
  const rows = await page.evaluate(`Array.from(document.querySelectorAll('input,select,textarea'))
    .filter((e) => e.type !== 'hidden')
    .map((e) => ({
      tag: e.tagName, type: e.type, id: e.id, name: e.getAttribute('name'),
      placeholder: e.getAttribute('placeholder'), maxlength: e.getAttribute('maxlength'),
      visible: !!(e.offsetWidth || e.offsetHeight),
    }))`);
  console.log("inputs:");
  for (const r of rows as unknown[]) console.log("  ", JSON.stringify(r));
}

async function dumpClickables(page: Page, limit = 40) {
  const rows = await page.evaluate(`Array.from(document.querySelectorAll('button,a,input[type=button],input[type=submit],[onclick]'))
    .map((e) => ({
      tag: e.tagName, text: (e.innerText || e.value || '').trim().slice(0, 30),
      id: e.id, onclick: (e.getAttribute('onclick') || '').slice(0, 80),
      href: (e.getAttribute('href') || '').slice(0, 80),
      visible: !!(e.offsetWidth || e.offsetHeight),
    }))
    .filter((x) => x.text || x.onclick)`);
  console.log("clickables:");
  for (const r of (rows as unknown[]).slice(0, limit)) console.log("  ", JSON.stringify(r));
}

/** `sessionCheck.do` printed raw. A boolean would hide `-1` vs a broken probe. */
async function sessionCheck(page: Page, label: string) {
  try {
    const res = await page.request.post(SITE.sessionCheck, { timeout: 15_000 });
    const body = (await res.json()) as { resultCode?: number };
    console.log(`[session ${label}] status=${res.status()} resultCode=${body.resultCode ?? "?"}`);
    return body.resultCode;
  } catch (e) {
    console.log(`[session ${label}] failed:`, e instanceof Error ? e.message : String(e));
    return undefined;
  }
}

/** `sCustNo` on the booking host — empty means it does not know us. */
async function bookingIdentity(page: Page, label: string) {
  const g = await page
    .evaluate(`JSON.stringify({
      sCustNo: typeof sCustNo !== 'undefined' ? String(sCustNo) : null,
      sContYn: typeof sContYn !== 'undefined' ? String(sContYn) : null,
      sCmdCd:  typeof sCmdCd  !== 'undefined' ? String(sCmdCd)  : null,
    })`)
    .catch((e: unknown) => `ERR ${e instanceof Error ? e.message : String(e)}`);
  // Redact the number itself — it identifies the corporate account.
  const parsed = typeof g === "string" && g.startsWith("{") ? JSON.parse(g) : null;
  if (parsed) {
    parsed.sCustNo = parsed.sCustNo ? `<set:${String(parsed.sCustNo).length}>` : parsed.sCustNo;
  }
  console.log(`[booking ${label}]`, parsed ? JSON.stringify(parsed) : g);
  return parsed?.sCustNo ? true : false;
}

/** Raw `sCustNo`, for steps that must actually call the gateway. */
async function readCustNo(page: Page): Promise<string> {
  return String(
    await page.evaluate(`typeof sCustNo !== 'undefined' ? String(sCustNo) : ''`).catch(() => ""),
  );
}

/** Record every gateway call the page makes, decoded. */
function recordGateway(page: Page) {
  const calls: Array<{ intf: string; search: Record<string, unknown> | null }> = [];
  page.on("request", (r) => {
    if (!r.url().startsWith(SITE.gateway)) return;
    const m = (r.postData() ?? "").match(/(?:^|&)ds=([^&]*)/);
    if (!m) return;
    try {
      const j = JSON.parse(decodeURIComponent(m[1].replace(/\+/g, " ")));
      calls.push({ intf: j.serviceInfo?.INTF_ID ?? "?", search: j.ds_search?.[0] ?? null });
    } catch {
      /* not ours */
    }
  });
  return calls;
}

async function callGateway(
  page: Page,
  service: { INTF_ID: string; RECV_SVC_CD: string },
  search: Record<string, unknown>,
): Promise<{ rows: Record<string, unknown>[]; ms: number; status: number }> {
  const started = Date.now();
  const res = await page.request.post(SITE.gateway, {
    timeout: 30_000,
    headers: { Referer: SITE.calendarPage },
    form: { ds: JSON.stringify({ ds_search: [search], serviceInfo: service }) },
  });
  const text = await res.text();
  let rows: Record<string, unknown>[] = [];
  try {
    rows = JSON.parse(text)?.ds?.Data?.ds_result ?? [];
  } catch {
    console.log("  [gateway] unparseable:", text.slice(0, 200));
  }
  return { rows, ms: Date.now() - started, status: res.status() };
}

/** One calendar call using the crawler's own config, so the two cannot drift. */
async function calendar(
  page: Page,
  custNo: string,
  branch: { brchCd: string; locCd: string; value: string },
  from: string,
  to: string,
  override: Record<string, string> = {},
) {
  const { HANWHA } = await import("../src/crawlers/hanwha/config");
  return callGateway(page, HANWHA.calendarService, {
    ...HANWHA.request,
    BRCH_CD: branch.brchCd,
    LOC_CD: branch.locCd,
    CUST_NO: custNo,
    STRT_DATE: from,
    END_DATE: to,
    ...override,
  });
}

/** The comparison primitive every A/B measurement in this file uses. */
function fingerprint(rows: Record<string, unknown>[]) {
  const dates = [...new Set(rows.map((r) => String(r.SESN_DATE)))].sort();
  const types = [...new Set(rows.map((r) => String(r.ROOM_TYPE_CD)))].sort();
  const dist: Record<string, number> = {};
  const byKey = new Map<string, string>();
  for (const r of rows) {
    const code = String(r.RSRV_CLDR_RSLT_CD);
    dist[code] = (dist[code] ?? 0) + 1;
    byKey.set(`${r.SESN_DATE}|${r.ROOM_TYPE_CD}`, `${code}|${r.RSRV_POSBL_CNT}`);
  }
  return { count: rows.length, dates, types, dist, byKey };
}

function compare(a: ReturnType<typeof fingerprint>, b: ReturnType<typeof fingerprint>) {
  let shared = 0;
  let differing = 0;
  let onlyB = 0;
  for (const [k, v] of b.byKey) {
    const av = a.byKey.get(k);
    if (av === undefined) onlyB++;
    else if (av !== v) differing++;
    else shared++;
  }
  return { shared, differing, onlyB };
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** KST "today", the same day the scheduler's hot window starts on. */
function todayKst(): Date {
  const now = new Date(Date.now() + 9 * 3_600_000);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function plusDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

async function main() {
  const step = process.argv[2] ?? "main";
  const arg = process.argv[3];
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

  const { HANWHA } = await import("../src/crawlers/hanwha/config");

  if (step === "main") {
    await page.goto(arg ?? SITE.home, { waitUntil: "domcontentloaded", timeout: 40_000 });
    await page.waitForTimeout(4_000);
    await dump(page, "main");
    const hosts = await page.evaluate(`JSON.stringify([...new Set(
      Array.from(document.querySelectorAll('a[href^=http]'))
        .map((a) => new URL(a.href).host))].sort())`);
    console.log("outbound hosts:", hosts);
    const html = await page.content();
    const booking = [
      ...new Set([...html.matchAll(/isBooking\(\s*["']([^"']+)["']/g)].map((m) => m[1])),
    ];
    console.log("booking entry points:");
    for (const u of booking) console.log("  ", u);
  } else if (step === "login") {
    // Selectors only. This step must not spend a login attempt.
    await page.goto(SITE.login, { waitUntil: "domcontentloaded", timeout: 40_000 });
    await page.waitForTimeout(3_000);
    await dump(page, "login");
    await dumpInputs(page);
    await dumpClickables(page, 25);
    console.log("frames:", page.frames().map((f) => f.url()).join(" | "));
    for (const [name, sel] of Object.entries(HANWHA.login)) {
      if (typeof sel !== "string") continue;
      const n = await page.locator(sel).count().catch(() => -1);
      console.log(`  config.login.${name} = ${sel} → ${n} match(es)`);
    }
  } else if (step === "doLogin") {
    const creds = await resolveCredentials();
    console.log(
      `[creds] id=${creds.id.length} chars, pw=${creds.pw.length} chars, 회원권pw=${creds.memo.length} chars`,
    );
    const { performLogin } = await import("../src/crawlers/hanwha/login");
    const ctx = {
      resortId: "debug",
      slug: "hanwha",
      context,
      page,
      credentials: { id: creds.id, pw: creds.pw, memo: creds.memo },
      log: (msg: string, meta?: Record<string, unknown>) => console.log(msg, meta ?? ""),
    };
    await sessionCheck(page, "before");
    await performLogin(ctx);
    await sessionCheck(page, "after");
    // Screenshot only — never the HTML. See the header note.
    await dump(page, "after-login");
    console.log("cookies:");
    for (const c of await context.cookies()) {
      console.log(`   ${c.domain}\t${c.name}\tlen=${c.value.length}`);
    }
    await saveState(context, "post-login");
  } else if (step === "bridge") {
    // The pivotal step: it decides the SHAPE of search.ts, not just its body.
    // A logged-in `www` session does not reach the booking host on its own.
    console.log("hop0 — restored state, no navigation");
    await sessionCheck(page, "hop0");

    console.log("\nhop1 — booking host, straight to the calendar page");
    await page.goto(SITE.calendarPage, { waitUntil: "domcontentloaded", timeout: 40_000 });
    await page.waitForTimeout(4_000);
    await bookingIdentity(page, "hop1");

    console.log("\nhop2 — after loading the booking host's own entrance page");
    await page.goto(SITE.entrance, { waitUntil: "domcontentloaded", timeout: 40_000 });
    await page.waitForTimeout(3_000);
    await bookingIdentity(page, "hop2");

    console.log("\nhop3 — calendar page again, now that the session exists");
    await page.goto(SITE.calendarPage, { waitUntil: "domcontentloaded", timeout: 40_000 });
    await page.waitForTimeout(4_000);
    await bookingIdentity(page, "hop3");
    await dump(page, "bridge");
    if (dialogs.length) console.log("dialogs:", JSON.stringify(dialogs));
  } else if (step === "session") {
    // How long the session lives decides whether every cron pass re-logs in.
    const rounds = Number(process.env.SESSION_ROUNDS ?? 12);
    const every = Number(process.env.SESSION_EVERY_MS ?? 300_000);
    for (let i = 0; i < rounds; i++) {
      const code = await sessionCheck(page, `t+${Math.round((i * every) / 60_000)}m`);
      if (code !== 0) {
        console.log("session expired at round", i);
        break;
      }
      if (i < rounds - 1) await page.waitForTimeout(every);
    }
  } else if (step === "cal") {
    // "Our request succeeded" is not evidence that we asked the site's own
    // question. This site answers a wrong BRCH_CD/LOC_CD pair with 200 and zero
    // rows, and a wrong RSRV_CLDR_CL_CD with a full, plausible, WRONG calendar.
    // So: record what the member screen sends, then send ours and diff.
    await page.goto(SITE.entrance, { waitUntil: "domcontentloaded", timeout: 40_000 });
    await page.waitForTimeout(3_000);
    const custNo = await readCustNo(page);
    if (!custNo) throw new Error("booking host does not know us — run doLogin first");

    const recorded = recordGateway(page);
    await page.goto(SITE.calendarPage, { waitUntil: "domcontentloaded", timeout: 40_000 });
    await page.waitForTimeout(9_000);

    console.log("\n=== what the member screen itself sends ===");
    let theirs: Record<string, unknown> | null = null;
    for (const c of recorded) {
      if (c.intf !== HANWHA.calendarService.INTF_ID) {
        console.log("  -", c.intf);
        continue;
      }
      theirs = c.search;
      const shown = { ...c.search, CUST_NO: c.search?.CUST_NO ? "<redacted>" : "" };
      console.log("  * CALENDAR", JSON.stringify(shown));
    }
    if (!theirs) {
      console.log("  (the screen fired no calendar call — it may need a 조회 click)");
    }

    console.log("\n=== what our config would send ===");
    const ours: Record<string, unknown> = {
      ...HANWHA.request,
      BRCH_CD: String(theirs?.BRCH_CD ?? HANWHA.branches[0].brchCd),
      LOC_CD: String(theirs?.LOC_CD ?? HANWHA.branches[0].locCd),
      CUST_NO: custNo,
      STRT_DATE: String(theirs?.STRT_DATE ?? ymd(todayKst())),
      END_DATE: String(theirs?.END_DATE ?? ymd(plusDays(todayKst(), 30))),
    };
    console.log("  *", JSON.stringify({ ...ours, CUST_NO: "<redacted>" }));

    if (theirs) {
      const onlyTheirs = Object.keys(theirs).filter((k) => !(k in ours));
      const onlyOurs = Object.keys(ours).filter((k) => !(k in theirs));
      const differing = Object.keys(ours).filter(
        (k) => k in theirs && String(theirs[k] ?? "") !== String(ours[k] ?? "") && k !== "CUST_NO",
      );
      console.log("\n=== field diff ===");
      console.log("  only theirs:", JSON.stringify(onlyTheirs));
      console.log("  only ours  :", JSON.stringify(onlyOurs));
      console.log("  differing  :", JSON.stringify(differing.map((k) => `${k}: ${theirs[k]} ≠ ${ours[k]}`)));
    }

    console.log("\n=== the status code table, from the site ===");
    const res = await page.request.post(SITE.commonCode, {
      timeout: 20_000,
      headers: { Referer: SITE.calendarPage },
      form: {
        INTF_ID: "TFO00HBSSCMCMN0003",
        RECV_SVC_CD: "HBSSCMCMN0003",
        GRP_CD: "RSRV_CLDR_RSLT_CD",
        LANG_CD: "KO",
        CD_NM: "",
        USE_YN: "Y",
        SET1_VAL: "",
        SYSTEM_YN: "Y",
      },
    });
    const codes = (await res.json())?.ds?.Data?.ds_codeList ?? [];
    const configured = new Set(HANWHA.availableStatusCodes);
    for (const c of codes as Array<{ CMON_CD?: string; CMCD_NM?: string }>) {
      const mark = configured.has(c.CMON_CD ?? "") ? " ← available" : "";
      console.log(`   ${c.CMON_CD} = ${c.CMCD_NM}${mark}`);
    }
    const known = new Set((codes as Array<{ CMON_CD?: string }>).map((c) => c.CMON_CD));
    const stale = [...configured].filter((c) => !known.has(c));
    if (stale.length) console.log("  !! config lists codes the site no longer has:", stale);
  } else if (step === "span") {
    // Three measurements decide `InventoryRow.stay` and the request count.
    await page.goto(SITE.entrance, { waitUntil: "domcontentloaded", timeout: 40_000 });
    await page.waitForTimeout(3_000);
    const custNo = await readCustNo(page);
    if (!custNo) throw new Error("booking host does not know us — run doLogin first");
    const branch = HANWHA.branches.find((b) => b.value === arg) ?? HANWHA.branches[0];
    const start = todayKst();
    console.log(`branch: ${branch.value} (${branch.brchCd}/${branch.locCd})`);

    console.log("\nM1 — does the response honour the requested range?");
    for (const days of [30, 31, 45, 60]) {
      const { rows, ms, status } = await calendar(
        page,
        custNo,
        branch,
        ymd(start),
        ymd(plusDays(start, days)),
      );
      const f = fingerprint(rows);
      console.log(
        `   +${String(days).padStart(2)}일 → status=${status} rows=${String(f.count).padStart(4)} ` +
          `dates=${String(f.dates.length).padStart(2)} ${f.dates[0] ?? "-"}→${f.dates.at(-1) ?? "-"} ${ms}ms`,
      );
    }

    console.log("\nM2 — is the response contiguous across a month boundary?");
    const { rows: wide } = await calendar(page, custNo, branch, ymd(start), ymd(plusDays(start, 45)));
    const dates = fingerprint(wide).dates;
    const gaps: string[] = [];
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(
        `${dates[i - 1].slice(0, 4)}-${dates[i - 1].slice(4, 6)}-${dates[i - 1].slice(6)}T00:00:00Z`,
      );
      if (ymd(plusDays(prev, 1)) !== dates[i]) gaps.push(`${dates[i - 1]}→${dates[i]}`);
    }
    console.log(`   ${dates.length} dates, gaps: ${gaps.length ? gaps.join(", ") : "none"}`);

    console.log("\nM3 — does the room count change anything? (RSRV_ROOM_CNT)");
    const base = fingerprint(wide);
    for (const cnt of ["2", "3"]) {
      const { rows } = await calendar(page, custNo, branch, ymd(start), ymd(plusDays(start, 45)), {
        RSRV_ROOM_CNT: cnt,
      });
      const c = compare(base, fingerprint(rows));
      console.log(
        `   RSRV_ROOM_CNT=${cnt} → shared=${c.shared} differing=${c.differing} onlyHere=${c.onlyB}` +
          (c.differing === 0 && c.onlyB === 0 ? "  ← identical (ignored)" : "  ← CHANGES the answer"),
      );
    }

    console.log("\nM4 — does RSRV_CLDR_CL_CD still separate 회원 from 일반?");
    const { rows: general } = await calendar(page, custNo, branch, ymd(start), ymd(plusDays(start, 45)), {
      RSRV_CLDR_CL_CD: "02",
    });
    const c = compare(base, fingerprint(general));
    console.log(`   회원(01) dist:`, JSON.stringify(base.dist));
    console.log(`   일반(02) dist:`, JSON.stringify(fingerprint(general).dist));
    console.log(
      `   differing=${c.differing}` +
        (c.differing === 0
          ? "  ← WARNING: the member view is no longer distinct; config.request may be stale"
          : "  ← member view confirmed distinct"),
    );
  } else if (step === "rows") {
    // Exercise hanwha/search.ts + parse.ts standalone.
    const { performSearch } = await import("../src/crawlers/hanwha/search");
    const { parseDate, todayKstIso, addDaysUtc, toIsoDate } = await import("../src/lib/utils");
    const checkin = parseDate(todayKstIso());
    const ctx = {
      resortId: "debug",
      slug: "hanwha",
      context,
      page,
      credentials: { id: "", pw: "" },
      log: (msg: string, meta?: Record<string, unknown>) => console.log(msg, meta ?? ""),
    };
    const nights = Number(process.env.NIGHTS ?? 1);
    const rows = await performSearch(ctx, {
      checkin,
      checkout: addDaysUtc(checkin, nights),
      ...(arg ? { branch: arg } : {}),
    });
    console.log(`\nrows: ${rows.length} (nights=${nights})`);
    console.log(JSON.stringify(rows.slice(0, 8), null, 2));
    const byBranch: Record<string, number> = {};
    for (const r of rows) byBranch[r.branchName] = (byBranch[r.branchName] ?? 0) + 1;
    console.log("per branch:", JSON.stringify(byBranch, null, 2));
    console.log("regions:", JSON.stringify([...new Set(rows.map((r) => r.region))]));
    console.log("room types:", [...new Set(rows.map((r) => r.roomType))].length);
    console.log(
      "stay attribution:",
      JSON.stringify([...new Set(rows.map((r) => (r.stay ? "stay-stamped" : "requested-window")))]),
    );
    const checkins = [...new Set(rows.map((r) => (r.stay ? toIsoDate(r.stay.checkin) : "")))].sort();
    console.log(`check-in span: ${checkins.length} days ${checkins[0]} → ${checkins.at(-1)}`);
    console.log(
      `available=${rows.filter((r) => r.available).length} closingSoon=${rows.filter((r) => r.closingSoon).length}`,
    );
    const past = rows.filter((r) => r.stay && toIsoDate(r.stay.checkin) < todayKstIso());
    console.log(`past-dated rows: ${past.length}`);
  } else if (step === "diff") {
    // Config rot is silent here: a stale BRCH_CD/LOC_CD pair returns 200 with
    // zero rows, and the symptom downstream is "필터를 눌렀는데 0건" —
    // indistinguishable from a crawl failure.
    await page.goto(SITE.entrance, { waitUntil: "domcontentloaded", timeout: 40_000 });
    await page.waitForTimeout(3_000);
    const custNo = await readCustNo(page);
    if (!custNo) throw new Error("booking host does not know us — run doLogin first");

    const { rows } = await callGateway(page, PROPERTY_SERVICE, { CUST_NO: "" });
    const onSite = rows.map((r) => ({
      brchCd: String(r.BRCH_CD),
      locCd: String(r.LOC_CD),
      name: String(r.LOC_NM),
      addr: String(r.BRCH_ADDR ?? ""),
    }));
    console.log(`site lists ${onSite.length} properties, config has ${HANWHA.branches.length}\n`);

    const configured = new Map(HANWHA.branches.map((b) => [`${b.brchCd}/${b.locCd}`, b]));
    for (const p of onSite) {
      const key = `${p.brchCd}/${p.locCd}`;
      const b = configured.get(key);
      if (!b) {
        console.log(`  + on site, NOT in config: ${key} ${p.name}  (${p.addr.slice(0, 20)})`);
      } else if (b.value !== p.name) {
        console.log(`  ~ name drift ${key}: site="${p.name}" config="${b.value}"`);
      }
      configured.delete(key);
    }
    for (const [key, b] of configured) {
      console.log(`  - in config, NOT on site: ${key} ${b.value}`);
    }

    // The site is inconsistent about its own province names (전라남도 next to
    // 전남, 강원 next to 강원특별자치도) — the very reason config normalises to
    // the two-character form every other resort uses. Normalise here too, or
    // this check flags correct config on every run and stops being read.
    const shortRegion = (addrHead: string): string =>
      addrHead
        .replace(/특별자치도$|특별자치시$|광역시$|특별시$/, "")
        .replace(/^전라남/, "전남")
        .replace(/^전라북/, "전북")
        .replace(/^경상남/, "경남")
        .replace(/^경상북/, "경북")
        .replace(/^충청남/, "충남")
        .replace(/^충청북/, "충북")
        .slice(0, 2);

    console.log("\nregion mapping (config vs the site's address):");
    for (const b of HANWHA.branches) {
      const p = onSite.find((x) => x.brchCd === b.brchCd && x.locCd === b.locCd);
      const addrHead = (p?.addr ?? "").split(" ")[0];
      // 더 플라자 reports no address at all; config's 서울 comes from the hotel
      // itself, so there is nothing here to disagree with.
      const verdict = !addrHead ? "· " : shortRegion(addrHead) === b.region ? "  " : "!!";
      console.log(
        `  ${verdict} ${b.value.padEnd(16)} config=${b.region}  site=${addrHead || "(주소 없음)"}`,
      );
    }

    console.log("\nroom types actually returned, per property:");
    const start = todayKst();
    for (const b of HANWHA.branches) {
      const { rows: cal, status } = await calendar(
        page,
        custNo,
        b,
        ymd(start),
        ymd(plusDays(start, 7)),
      );
      const types = [
        ...new Map(cal.map((r) => [String(r.ROOM_TYPE_CD), String(r.ROOM_TYPE_NM)])).entries(),
      ];
      const unnamed = types.filter(([, nm]) => !nm || nm === "undefined").map(([cd]) => cd);
      console.log(
        `  ${b.value.padEnd(16)} status=${status} rows=${String(cal.length).padStart(4)} types=${String(types.length).padStart(2)}` +
          (cal.length === 0 ? "   ← ZERO ROWS: check the BRCH_CD/LOC_CD pair" : "") +
          (unnamed.length ? `   ← unnamed codes: ${unnamed.join(",")}` : ""),
      );
    }
  } else {
    await page.goto(arg ?? SITE.home, { waitUntil: "domcontentloaded", timeout: 40_000 });
    await page.waitForTimeout(4_000);
    await dump(page, "custom");
    await dumpInputs(page);
    await dumpClickables(page);
  }

  if (dialogs.length) console.log("\n[dialogs seen]", JSON.stringify(dialogs));
  await browser.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
