import "dotenv/config";
import { createDecipheriv, createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { BrowserContext, Page, Response } from "playwright-core";
import { launchBrowser, newContextFromState } from "../src/crawlers/_shared/browser";

/**
 * Site exploration helper for building the RESOM crawler (Phase F).
 *
 * A copy of `scripts/debug-sono.ts` rather than a generalization, for the same
 * reason that one was a copy of `debug-page.ts`: each file's steps are the
 * narrative of one investigation, and they stay the tool for diagnosing that
 * resort's regressions later. A shared abstraction would have to keep every
 * site's quirks alive at once.
 *
 * What is already known (2026-08-09, before any login):
 * - Booking lives on `book.resom.co.kr`, a Vite/Vue SPA — the served HTML is
 *   1.6KB with a single `<div id="allwrap">`. So, like SONO, the browser is
 *   only needed for login and search should be a plain JSON request.
 * - The bundle contains an axios layer with `room/list`, `room/price/list`,
 *   `api/detail/...` under an `/api/user/...` prefix, same origin.
 * - Routes: /login /roomReservation /packageReservation /drawLots /myPage.
 *   We collect **회원 객실 예약 only** — package/draw/coupon flows are a
 *   different product and would not mean the same thing as the Lotte and SONO
 *   rows they would sit next to.
 *
 * Usage:
 *   CRAWLER_HEADLESS=false npx tsx scripts/debug-resom.ts <step> [arg]
 *
 * Steps (in the order the survey wants them):
 *   main      entry point — header links, outbound hosts, layers
 *   login     login form — inputs, buttons, frames, aria snapshot
 *   doLogin   real login, save session, dump cookies + JSON calls
 *   net       record every JSON response while YOU drive a search by hand
 *             ← this step decides the JSON-API vs DOM branch
 *   api       GET a discovered endpoint with the saved session
 *   apiPost   POST one (body via POST_BODY env)
 *   rows      run resom/search.ts standalone (only after it exists)
 *   span      what one availability call actually covers, and whether the
 *             night count changes anything — decides `InventoryRow.stay`
 *   diff      compare the site's property list against RESOM.branches
 *
 * Credentials: `RESOM_ID`/`RESOM_PW` env if set, otherwise the primary
 * ResortAccount from the DB — the same one `run.ts` uses, so the survey
 * exercises the real account rather than a lookalike.
 *
 * `doLogin` writes the authenticated storage state to `${OUT}-state.json` and
 * every other step reuses it. Logging in once per survey rather than once per
 * step keeps us off the site's rate limiter — and a locked account is not a
 * hypothetical here: the Lotte survey produced a run of silent login failures
 * that were indistinguishable from a wrong password.
 */
const OUT = process.env.DEBUG_OUT ?? "/tmp/resom-debug";
const STATE_FILE = `${OUT}-state.json`;

const SITE = {
  /** Marketing site. Booking is a different host. */
  home: "https://www.resom.co.kr",
  book: "https://book.resom.co.kr",
  login: process.env.RESOM_LOGIN_URL ?? "https://book.resom.co.kr/login",
  /** 회원 객실 예약 — the only flow this crawler is about. */
  booking:
    process.env.RESOM_BOOKING_URL ?? "https://book.resom.co.kr/roomReservation?resort=resom",
};

/**
 * Login form, observed 2026-08-09 by the `login` step.
 *
 * There is no `<form>` and the inputs carry no `name` or `id` — only
 * placeholders. The submit is `<a class="btn login_btn">로그인</a>`, and the
 * header renders another `<a>로그인</a>` with the same accessible name, so the
 * class is what separates them. `getByRole("button")` finds neither: the only
 * button on the page is "GO".
 */
const LOGIN_SEL = {
  id: process.env.RESOM_ID_SEL ?? "input[placeholder='아이디를 입력해주세요']",
  pw: process.env.RESOM_PW_SEL ?? "input[type='password']",
  submit: process.env.RESOM_SUBMIT_SEL ?? "a.login_btn",
};

async function resolveCredentials(): Promise<{ id: string; pw: string }> {
  if (process.env.RESOM_ID && process.env.RESOM_PW) {
    return { id: process.env.RESOM_ID, pw: process.env.RESOM_PW };
  }
  const { prisma } = await import("../src/lib/prisma");
  const { decrypt } = await import("../src/lib/crypto");
  const resort = await prisma.resort.findUnique({ where: { slug: "RESOM" } });
  if (!resort) throw new Error("RESOM resort row missing — run npm run db:seed");
  const account = await prisma.resortAccount.findFirst({
    where: { resortId: resort.id, isPrimary: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!account) {
    throw new Error(
      "No primary RESOM ResortAccount. Add one at /admin/accounts, or set RESOM_ID/RESOM_PW.",
    );
  }
  return { id: decrypt(account.idEncrypted), pw: decrypt(account.pwEncrypted) };
}

/**
 * Close whatever sits in front of the page. Names are guesses until observed;
 * `exact` keeps a substring match from hitting an unrelated 확인 button and
 * navigating away mid-survey (that happened on SONO).
 */
async function dismissLayers(page: Page) {
  for (const name of ["오늘 하루 보지 않기", "오늘 하루 그만보기", "닫기", "확인", "동의"]) {
    try {
      await page.getByRole("button", { name, exact: true }).first().click({ timeout: 1_500 });
      console.log(`[layer] closed "${name}"`);
      await page.waitForTimeout(500);
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

async function dumpButtons(page: Page, limit = 40) {
  const buttons = await page.getByRole("button").allInnerTexts();
  console.log(
    "buttons:",
    JSON.stringify(
      buttons.map((b) => b.trim().replace(/\s+/g, " ")).filter(Boolean).slice(0, limit),
    ),
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

/**
 * The API is token-based, not cookie-based — the session cookies ride along and
 * still get a 401. The SPA sends:
 *
 *   Authorization: Bearer <auth.authorization>
 *   login-id: <memberInfo.intnetId>
 *   user-device: HOMEPAGE
 *
 * and keeps the token in localStorage under a pinia-persist entry whose key is
 * `SHA256("hoban-user-front-local")` and whose value is CryptoJS AES with a
 * constant app passphrase (i.e. OpenSSL "Salted__" + MD5 KDF). Decrypting it is
 * the only way to reach the API from a *restored* session, since a restored
 * session never sees the login response.
 *
 * The crawler will not depend on this: `login.ts` stashes the token under its
 * own plain key at login time, which `storageState` persists just the same.
 * This decryption stays here so the survey can work against an existing session
 * instead of logging in again for every question.
 */
const PINIA = {
  storeKey: "hoban-user-front-local",
  passphrase: "bsydudl2s3odflt4sd223",
};

function decryptPinia(b64: string): unknown {
  const data = Buffer.from(b64, "base64");
  if (data.subarray(0, 8).toString() !== "Salted__") {
    throw new Error("unexpected pinia blob format (not OpenSSL-salted)");
  }
  const salt = data.subarray(8, 16);
  let derived = Buffer.alloc(0);
  let block = Buffer.alloc(0);
  while (derived.length < 48) {
    block = createHash("md5")
      .update(Buffer.concat([block, Buffer.from(PINIA.passphrase), salt]))
      .digest();
    derived = Buffer.concat([derived, block]);
  }
  const decipher = createDecipheriv(
    "aes-256-cbc",
    derived.subarray(0, 32),
    derived.subarray(32, 48),
  );
  const plain = Buffer.concat([
    decipher.update(data.subarray(16)),
    decipher.final(),
  ]).toString("utf8");
  // Double-encoded: the blob holds a JSON string that itself holds the state.
  const once = JSON.parse(plain);
  return typeof once === "string" ? JSON.parse(once) : once;
}

interface ResomAuth {
  token: string;
  loginId: string;
}

/** Pull the bearer token + login id out of the page's persisted pinia store. */
async function readAuth(page: Page): Promise<ResomAuth> {
  const key = createHash("sha256").update(PINIA.storeKey).digest("hex");
  const blob = await page.evaluate((k) => window.localStorage.getItem(k), key);
  if (!blob) throw new Error("no persisted auth in localStorage — run `doLogin` first");
  const state = decryptPinia(blob) as {
    auth?: { authorization?: string; savedId?: string; memberInfo?: { intnetId?: string } };
  };
  const token = state.auth?.authorization ?? "";
  const loginId = state.auth?.memberInfo?.intnetId ?? state.auth?.savedId ?? "";
  if (!token) throw new Error("persisted store has no auth.authorization");
  return { token, loginId };
}

/**
 * Give the crawler's own auth cookie to a survey session.
 *
 * `resom/login.ts` writes that cookie when it logs in; a session saved by
 * `doLogin` here only has the site's copy. Translating one into the other lets
 * `rows`/`span` exercise the real search and parse code without spending
 * another login on the live account.
 */
async function seedCrawlerCookie(page: Page, context: BrowserContext) {
  const { RESOM } = await import("../src/crawlers/resom/config");
  const existing = await context.cookies(RESOM.baseUrl);
  if (existing.some((c) => c.name === RESOM.auth.cookieName)) return;
  await page.goto(SITE.booking, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(2_000);
  const auth = await readAuth(page);
  await context.addCookies([
    {
      name: RESOM.auth.cookieName,
      value: Buffer.from(JSON.stringify(auth), "utf8").toString("base64"),
      domain: RESOM.auth.cookieDomain,
      path: "/",
      secure: true,
    },
  ]);
  console.log("[state] seeded crawler auth cookie from the survey session");
}

function authHeaders(auth: ResomAuth): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json; charset=utf-8",
    Authorization: `Bearer ${auth.token}`,
    "login-id": auth.loginId,
    "user-device": "HOMEPAGE",
  };
}

/** Attach a JSON-response recorder; returns the accumulator to print later. */
function recordJson(page: Page) {
  const calls: { line: string; url: string }[] = [];
  const noise = /google|facebook|doubleclick|kakao|naver|criteo|analytics|gtm|hotjar|clarity|digicert/i;
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

/**
 * Record full request/response bodies for anything that looks like inventory.
 * The URL alone never tells us the POST shape `search.ts` has to reproduce.
 */
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
  // Booking widgets tend to render their controls off-canvas below ~1440px.
  await page.setViewportSize({ width: 1920, height: 1080 });

  if (step === "main") {
    await page.goto(urlArg ?? SITE.book, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(5_000);
    await dismissLayers(page);
    await dump(page, "main");
    await dumpLinks(page, "header", "header");
    await dumpButtons(page);
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
    // Member-type tabs are what the Lotte crawler got wrong first (리워즈 vs
    // L.POINT), so surface every tab-ish control explicitly rather than
    // assuming there is only one form.
    const tabs = await page
      .locator("[role='tab'], .tab, [class*='tab'] a, [class*='tab'] button")
      .evaluateAll((els) =>
        els
          .map((e) => (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40))
          .filter(Boolean)
          .slice(0, 20),
      );
    console.log("tab-ish controls:", JSON.stringify(tabs));
    // The submit control is not necessarily a <button>: SONO's was, Lotte's
    // cookie-consent "전체 동의" was not, and here `getByRole("button")` finds
    // only "GO". Dump every clickable-looking node with its tag and classes so
    // the selector comes from what is there rather than from an assumption.
    const clickables = await page
      .locator("button, a, [role='button'], [class*='btn'], [class*='button'], input[type='submit']")
      .evaluateAll((els) =>
        els
          .map((e) => ({
            tag: e.tagName,
            text: (e.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30),
            cls: (e.getAttribute("class") ?? "").slice(0, 60),
            type: e.getAttribute("type"),
            href: e.getAttribute("href"),
            visible: (e as HTMLElement).offsetParent !== null,
          }))
          .filter((o) => o.visible && (o.text || o.type === "submit"))
          .slice(0, 40),
      );
    console.log("clickables:", JSON.stringify(clickables, null, 2));
    console.log("frames:", page.frames().map((f) => f.url().slice(0, 140)));
    try {
      console.log("aria snapshot (form):");
      console.log(await page.locator("form").first().ariaSnapshot());
    } catch {
      console.log("(no form element)");
    }
  } else if (step === "doLogin") {
    const { id, pw } = await resolveCredentials();
    console.log(
      `[login] using account "${id.slice(0, 2)}***" (${process.env.RESOM_ID ? "env" : "db"})`,
    );
    const calls = recordJson(page);
    // Where does the bearer token come back? `login.ts` will capture it here
    // rather than decrypting the app's own localStorage blob, so its shape has
    // to be pinned down. Keys only — the values are the credential.
    page.on("response", async (res) => {
      if (!/\/auth\/login$/.test(res.url())) return;
      try {
        const body = JSON.parse(await res.text()) as Record<string, unknown>;
        const shape = (o: unknown, d = 0): string =>
          o && typeof o === "object" && d < 2
            ? `{${Object.entries(o as Record<string, unknown>)
                .map(([k, v]) =>
                  v && typeof v === "object"
                    ? `${k}:${shape(v, d + 1)}`
                    : `${k}:${typeof v}${typeof v === "string" ? `(${v.length})` : ""}`,
                )
                .join(", ")}}`
            : "…";
        console.log("[login] /auth/login response shape:", shape(body));
      } catch {
        /* diagnostics only */
      }
    });
    await page.goto(urlArg ?? SITE.login, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(4_000);
    await dismissLayers(page);
    await page.locator(LOGIN_SEL.id).first().fill(id);
    await page.locator(LOGIN_SEL.pw).first().fill(pw);
    try {
      await page.locator(LOGIN_SEL.submit).first().click({ timeout: 6_000 });
      console.log("[login] submitted via a.login_btn");
    } catch {
      // Some SPAs bind Enter on the password field instead of a real submit.
      await page.locator(LOGIN_SEL.pw).first().press("Enter");
      console.log("[login] submitted via Enter");
    }
    await page.waitForTimeout(8_000);
    await dump(page, "after-login");
    writeFileSync(STATE_FILE, JSON.stringify(await context.storageState(), null, 2));
    console.log(`[state] saved ${STATE_FILE}`);
    const alerts = await page.locator("[role='alert']").allInnerTexts();
    console.log("alerts:", JSON.stringify(alerts.map((a) => a.trim()).filter(Boolean)));
    console.log(
      "cookies:",
      JSON.stringify(
        (await context.cookies()).map((c) => ({ name: c.name, domain: c.domain })),
        null,
        2,
      ),
    );
    console.log("json calls during login:\n" + calls.map((c) => c.line).join("\n"));
    // Candidate session probes — whichever returns a stable authenticated
    // signal becomes `checkLoggedIn` in resom/login.ts.
    for (const probe of (process.env.RESOM_PROBES ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      try {
        const res = await page.request.get(probe, { timeout: 10_000 });
        console.log(`[probe] ${res.status()} ${probe}\n  ${(await res.text()).slice(0, 300)}`);
      } catch (e) {
        console.log(`[probe] failed ${probe}:`, e instanceof Error ? e.message : e);
      }
    }
  } else if (step === "net") {
    // Manual-drive mode: the recorder runs while YOU perform a real search in
    // the visible browser. Automating the widget before knowing its shape is
    // exactly the guesswork this step exists to avoid.
    const waitMs = Number(process.env.NET_WAIT_MS ?? 90_000);
    const calls = recordJson(page);
    const payloads = recordPayloads(page, /\/api\/user\//);
    await page.goto(urlArg ?? SITE.booking, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(3_000);
    await dismissLayers(page);
    console.log(
      `\n>>> 브라우저에서 직접 지점·날짜를 골라 조회하세요. ${Math.round(waitMs / 1000)}초 동안 기록합니다.\n`,
    );
    await page.waitForTimeout(waitMs);
    await dump(page, "net-final");
    console.log(`json responses (${calls.length}):`);
    console.log(calls.map((c) => c.line).join("\n"));
    const inventoryish = calls.filter((c) =>
      /room|avail|inven|stock|rsv|reserv|price|rate|product|goods|resort|store|place/i.test(c.url),
    );
    console.log(`\ninventory-ish (${inventoryish.length}):`);
    console.log(inventoryish.map((c) => c.line).join("\n"));
    printPayloads(payloads);
    console.log("\nfinal url:", page.url());
  } else if (step === "api") {
    if (!urlArg) throw new Error("usage: debug-resom.ts api <url>");
    await page.goto(SITE.booking, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2_000);
    const auth = await readAuth(page);
    console.log(`[auth] token ${auth.token.length} chars, login-id ${auth.loginId.slice(0, 2)}***`);
    const res = await page.request.get(urlArg, {
      timeout: 20_000,
      headers: { ...authHeaders(auth), Referer: SITE.booking },
    });
    console.log("status:", res.status());
    const text = await res.text();
    try {
      console.log(
        JSON.stringify(JSON.parse(text), null, 2).slice(0, Number(process.env.API_MAX ?? 20_000)),
      );
    } catch {
      console.log(text.slice(0, 3_000));
    }
  } else if (step === "apiPost") {
    if (!urlArg) throw new Error("usage: POST_BODY='{...}' debug-resom.ts apiPost <url>");
    await page.goto(SITE.booking, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2_000);
    const auth = await readAuth(page);
    const res = await page.request.post(urlArg, {
      timeout: 25_000,
      headers: { ...authHeaders(auth), Referer: SITE.booking },
      data: JSON.parse(process.env.POST_BODY ?? "{}"),
    });
    console.log("status:", res.status());
    const text = await res.text();
    try {
      console.log(
        JSON.stringify(JSON.parse(text), null, 2).slice(0, Number(process.env.API_MAX ?? 8_000)),
      );
    } catch {
      console.log(text.slice(0, 2_000));
    }
  } else if (step === "rows") {
    // Exercise resom/search.ts + parse.ts standalone. Requires those files.
    await seedCrawlerCookie(page, context);
    const { performSearch } = await import("../src/crawlers/resom/search");
    const { parseDate, todayKstIso, addDaysUtc } = await import("../src/lib/utils");
    const checkin = parseDate(todayKstIso());
    const ctx = {
      resortId: "debug",
      slug: "resom",
      context,
      page,
      credentials: { id: process.env.RESOM_ID ?? "", pw: process.env.RESOM_PW ?? "" },
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
    console.log("regions:", JSON.stringify([...new Set(rows.map((r) => r.region))]));
    const stays = [...new Set(rows.map((r) => (r.stay ? "stay-stamped" : "requested-window")))];
    console.log("stay attribution:", JSON.stringify(stays));
  } else if (step === "span") {
    // Two properties of the availability call decide how many requests a full
    // sweep costs, and neither is visible from a single call:
    //   1. how many dates one response covers, and
    //   2. whether the night count changes any status.
    // SONO answered "a whole month" and "not at all", which is why its 60 hot
    // windows cost 4 requests and why its parser AND-s the nights itself.
    // Re-run this whenever a sweep's request count changes unexpectedly.
    const { RESOM } = await import("../src/crawlers/resom/config");
    const { fetchCalendar } = await import("../src/crawlers/resom/search");
    const { todayKstIso, parseDate, addDaysUtc, toIsoDate } = await import("../src/lib/utils");

    const ctx = {
      resortId: "debug",
      slug: "resom",
      context,
      page,
      credentials: { id: "", pw: "" },
      log: (m: string, meta?: Record<string, unknown>) => console.log(m, meta ?? ""),
    };
    await page.goto(SITE.book, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const today = parseDate(todayKstIso());
    const branch = RESOM.branches[0];
    // Room-type codes come from the site, same as the crawler — a hardcoded
    // list here would let this step keep passing after the site changed.
    const auth = await readAuth(page);
    const condos = (await (
      await page.request.get(`${SITE.book}/api/user/reservation/roomReservation/allCondos`, {
        timeout: 30_000,
        headers: authHeaders(auth),
      })
    ).json()) as Array<{ condoCd: string; roomTypeList: Array<{ rmTypeCd: string }> }>;
    const codes =
      condos.find((c) => c.condoCd === branch.condoCd)?.roomTypeList.map((r) => r.rmTypeCd) ?? [];
    console.log(`branch=${branch.value} roomTypes=${codes.length}`);

    type Entry = { rmTypeCd?: string; statusBooking?: number; remdRmCnt?: number };
    const summarize = (payload: Record<string, Entry[]>) => {
      const dates = Object.keys(payload).sort();
      const byKey = new Map<string, string>();
      let count = 0;
      for (const [d, entries] of Object.entries(payload)) {
        for (const e of entries) {
          count++;
          byKey.set(`${d}|${e.rmTypeCd}`, `${e.statusBooking}|${e.remdRmCnt}`);
        }
      }
      return { dates, count, byKey };
    };

    console.log("\n(1) which dates come back, per requested date");
    for (const offset of [0, 11, 37]) {
      const checkin = addDaysUtc(today, offset);
      const { dates, count } = summarize(
        await fetchCalendar(ctx, branch, codes, { checkin, nights: 1 }),
      );
      const gaps = dates.filter((d, i) => {
        if (i === 0) return false;
        const prev = parseDate(
          `${dates[i - 1].slice(0, 4)}-${dates[i - 1].slice(4, 6)}-${dates[i - 1].slice(6, 8)}`,
        );
        return toIsoDate(addDaysUtc(prev, 1)) !== `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
      });
      console.log(
        `  req ${toIsoDate(checkin)}  entries=${String(count).padStart(5)}  days=${String(dates.length).padStart(3)}  ${dates[0] ?? "-"} → ${dates[dates.length - 1] ?? "-"}  gaps=${gaps.length}`,
      );
    }

    console.log("\n(2) does the night count change anything?");
    const base = summarize(await fetchCalendar(ctx, branch, codes, { checkin: today, nights: 1 }));
    for (const nights of [2, 7]) {
      const other = summarize(await fetchCalendar(ctx, branch, codes, { checkin: today, nights }));
      let shared = 0;
      let differing = 0;
      for (const [k, v] of other.byKey) {
        const b = base.byKey.get(k);
        if (b === undefined) continue;
        shared++;
        if (b !== v) differing++;
      }
      console.log(
        `  1night vs ${nights}night: shared=${shared} differing=${differing}` +
          (differing === 0
            ? "  ← nights is ignored (response is a calendar)"
            : "  ← nights MATTERS (response answers the stay)"),
      );
    }
  } else if (step === "diff") {
    // Drift watchdog: RESOM.branches is the runtime source of truth for
    // `branchName`, so the only way it can rot is silently. The symptom would
    // be "필터를 눌렀는데 0건", indistinguishable from a crawl failure.
    const { RESOM } = await import("../src/crawlers/resom/config");
    await page.goto(SITE.booking, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(2_000);
    const auth = await readAuth(page);
    // Compared against `allCondos`, not the rendered picker: that endpoint is
    // what the crawler itself reads, so this catches exactly the drift that
    // would matter — a property added or renamed under the crawler's feet.
    const condos = (await (
      await page.request.get(`${RESOM.apiBase}/roomReservation/allCondos`, {
        timeout: RESOM.timeouts.api,
        headers: authHeaders(auth),
      })
    ).json()) as Array<{ condoCd: string; condoNm: string; bizNm: string }>;
    const configured = RESOM.branches.map((b) => `${b.condoCd} ${b.value}`);
    const onSite = condos.map((c) => `${c.condoCd} ${c.condoNm}`);
    console.log("configured:", JSON.stringify(configured, null, 2));
    console.log("on site:", JSON.stringify(condos.map((c) => `${c.condoCd} ${c.condoNm} (${c.bizNm})`), null, 2));
    console.log("in config but not on site:", JSON.stringify(configured.filter((c) => !onSite.includes(c))));
    console.log("on site but not in config:", JSON.stringify(onSite.filter((s) => !configured.includes(s))));
  } else {
    await page.goto(urlArg ?? SITE.book, { waitUntil: "domcontentloaded", timeout: 30_000 });
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
