import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Page, Response } from "playwright-core";
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
  for (const name of ["닫기", "오늘 하루 그만보기", "전체 동의"]) {
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
