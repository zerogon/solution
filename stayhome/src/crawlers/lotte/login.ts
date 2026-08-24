import type { CrawlerContext } from "../types";
import { LOTTE } from "./config";

/**
 * What a login learns about itself while it runs.
 *
 * The hop list has always gone to stdout only, which is fine while somebody is
 * watching a terminal and useless three hours later: Vercel Hobby keeps runtime
 * logs briefly, and `CrawlLog.errorMessage` — the one record that survives —
 * used to say nothing but "isLogin is still false". This carries the few facts
 * that pick a branch of the decision tree so the stored error can name itself.
 */
export interface AuthTrace {
  /** Every auth-related response, in order, for the log. */
  hops: string[];
  /** Decisive hops only, compacted to their result fields (see SAFE_FIELDS). */
  signals: string[];
  /**
   * Set when the isLogin probe answered with something that is not our JSON.
   * A WAF challenge and a genuine logged-out answer both end this function
   * returning false, and only this field tells them apart.
   */
  probeBlocked: string | null;
}

export function newAuthTrace(): AuthTrace {
  return { hops: [], signals: [], probeBlocked: null };
}

/**
 * Probe the session via the isLogin endpoint. `page.request` shares the
 * browser context's cookies, so this validates a restored storageState without
 * any page navigation.
 *
 * `trace` is optional because `validateSession` asks this question with no
 * login in progress; during a login it is what distinguishes "the site says we
 * are not logged in" from "the site did not answer us at all".
 */
export async function checkLoggedIn(
  ctx: CrawlerContext,
  trace?: AuthTrace,
): Promise<boolean> {
  const { page, log } = ctx;
  try {
    const res = await page.request.get(LOTTE.isLoginUrl, {
      timeout: LOTTE.timeouts.api,
      headers: { Accept: "application/json" },
    });
    const contentType = res.headers()["content-type"] ?? "";
    if (!res.ok()) {
      // Used to be a silent `return false`, which made an Imperva 403 read
      // exactly like a logged-out session for the whole 25s poll.
      log("[lotte] isLogin probe rejected", { status: res.status(), contentType });
      if (trace) trace.probeBlocked = `${res.status()} ${contentType.slice(0, 40)}`;
      return false;
    }
    const body = (await res.json()) as { code?: string; data?: boolean };
    log("[lotte] isLogin probe", { code: body.code, data: body.data });
    return body.data === true;
  } catch (e) {
    // A 200 that carries a challenge page lands here, on `res.json()`.
    const msg = e instanceof Error ? e.message : String(e);
    log("[lotte] session validation failed", { error: msg });
    if (trace) trace.probeBlocked = msg.slice(0, 60);
    return false;
  }
}

/**
 * Close whatever modal layer is covering the login form.
 *
 * An undismissed layer does not fail where it is raised — it fails later on
 * the L.POINT tab click, reported as `.modal-dimm ... intercepts pointer
 * events`, which reads like a broken tab selector.
 *
 * Detection goes through the dimm, not the wrapper. Asking `.layer-wrap`
 * whether it is visible answered "no" while its dimm was swallowing every
 * click, so this function returned silently and logged nothing at all — the
 * absence of a log was the clue that the detector, not the site, was wrong.
 *
 * `seen` keeps the identity dump to once per login: the caller retries, and
 * the same overlay printed three times buries the run it belongs to.
 */
async function dismissOverlay(
  ctx: CrawlerContext,
  seen: { logged: boolean },
): Promise<void> {
  const { page, log } = ctx;
  const dimm = page.locator(LOTTE.login.overlayDimmSelector).first();
  // Give a late layer a moment to show itself. Without this the check ran
  // before the layer existed, returned quietly, and the layer arrived in the
  // middle of the tab click instead.
  await dimm
    .waitFor({ state: "visible", timeout: LOTTE.login.overlayAppearMs })
    .catch(() => {});
  if ((await dimm.count().catch(() => 0)) === 0) return;

  const layer = page
    .locator(LOTTE.login.overlaySelector)
    .filter({ has: page.locator(LOTTE.login.overlayDimmSelector) })
    .first();

  if (!seen.logged) {
    seen.logged = true;
    let heading = "";
    let buttons: string[] = [];
    try {
      heading = (await layer.innerText()).replace(/\s+/g, " ").trim().slice(0, 200);
      buttons = (await layer.locator("button, a").allInnerTexts())
        .map((t) => t.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 15);
    } catch {
      /* diagnostics only */
    }
    log("[lotte] overlay detected", { heading, buttons });
  }

  for (const name of LOTTE.login.overlayDismissButtonNames) {
    // getByText rather than getByRole: the dismiss control has turned up as an
    // <a> as often as a <button> on this site's layers.
    const candidate = layer.getByText(name, { exact: false }).first();
    if (!(await candidate.count().catch(() => 0))) continue;
    try {
      await candidate.click({ timeout: 3_000 });
      await dimm.waitFor({ state: "hidden", timeout: 3_000 }).catch(() => {});
      log("[lotte] overlay dismissed", { via: name });
      return;
    } catch {
      /* candidate did not take — try the next one */
    }
  }
  log("[lotte] overlay still open — no dismiss candidate matched");
}

/**
 * The hops that decide the verdict, as opposed to the ones that merely happen.
 *
 * `callLgn_01_001` is the bridge page L.POINT renders inside the login page,
 * `login_01_001` is where L.POINT actually authenticates, and
 * `ssoLogin/ssoLogin` is lottehotel.com adopting the result. The pattern is
 * anchored on the last path segment so `ssoLogin/lpointInit` — which fires on
 * every visit, logged in or not — does not count as the handoff.
 */
const DECISIVE_HOP = /callLgn_01_001|login_01_001|ssoLogin\/ssoLogin/i;

/**
 * The only fields we lift out of a 2xx auth response.
 *
 * A whitelist rather than a length cap, and that is the whole point: these
 * bodies also carry the account's login id, member number and name. Asking for
 * result codes by name means the rest cannot ride along by accident, however
 * the site rearranges its payload.
 */
const SAFE_FIELDS =
  /"(code|rtnCode|resultCode|rsltCd|errCd|errorCode|status|result|msg|message|rsltMsg|errMsg)"\s*:\s*(?:"([^"\\]{0,40})"|(-?[\d.]{1,12}|true|false|null))/gi;

/** Pull `code="0000" msg="…"` out of a JSON body without carrying anything else. */
function safeFields(body: string): string {
  const out: string[] = [];
  for (const m of body.matchAll(SAFE_FIELDS)) {
    out.push(`${m[1]}=${m[2] ?? m[3]}`);
    if (out.length >= 6) break;
  }
  return out.join(" ");
}

/**
 * Record the requests a login actually consists of, for the failure path.
 *
 * A working login (captured locally, 2026-08-09) is four hops:
 *
 *   GET  netfunnel.lottehotel.com/ts.wseq?…&aid=login   ← queue/admission control
 *   POST members.lpoint.com/exView/api/callLgn_01_001
 *   POST members.lpoint.com/exBiz/login/login_01_001    ← L.POINT authenticates
 *   POST api.lottehotel.com/ssoLogin/ssoLogin           → {"code":"0000", …}
 *
 * and the context ends up holding Imperva cookies (`reese84`, `visid_incap_*`,
 * `nlbi_*`, `incap_ses_*`). So there are two gates in front of the form that
 * have nothing to do with our selectors, and a login that fails at either
 * leaves the page looking exactly like one that was never submitted — which is
 * the shape production keeps failing in.
 *
 * Bodies: a challenge page or an error is captured whole (they are the
 * informative case and carry nobody's data), while a 2xx JSON gives up only
 * its result codes — see `SAFE_FIELDS`. The old rule captured nothing at all
 * from a 2xx, which is why the 2026-08-24 production failure could show that
 * `login_01_001` ran but not whether it said yes.
 *
 * `signals` is kept separately from `hops` and is never capped. The cap on
 * `hops` exists so a chatty page cannot fill a log line, but the verdict is
 * read off the decisive hops — and in the 08-24 failure the eleven captured
 * hops left exactly one slot, so a successful `ssoLogin` would have been the
 * first thing the cap threw away.
 */
function recordAuthTraffic(ctx: CrawlerContext, trace: AuthTrace): void {
  const wanted = /netfunnel|lpoint|ssoLogin|\/login/i;
  ctx.page.on("response", async (res) => {
    const url = res.url();
    if (!wanted.test(url) || /\.(js|css|png|jpg|gif|svg|woff2?)(\?|$)/i.test(url)) return;
    const contentType = res.headers()["content-type"] ?? "";
    const decisive = DECISIVE_HOP.test(url);
    let snippet = "";
    if (res.status() >= 300 || contentType.includes("html")) {
      try {
        snippet = (await res.text()).replace(/\s+/g, " ").slice(0, 160);
      } catch {
        /* body already consumed */
      }
    } else if (decisive) {
      try {
        snippet = safeFields(await res.text());
      } catch {
        /* body already consumed */
      }
    }
    if (trace.hops.length < 20) {
      trace.hops.push(
        `${res.status()} ${res.request().method()} ${url.slice(0, 120)}${snippet ? ` :: ${snippet}` : ""}`,
      );
    }
    if (decisive) {
      const name = url.split("?")[0].split("/").pop() ?? url;
      trace.signals.push(`${name}(${res.status()})${snippet ? ` ${snippet.slice(0, 60)}` : ""}`);
    }
  });
}

/**
 * Which branch of the decision tree in AGENTS.md this failure is on.
 *
 * The tree was already written down; this makes the code walk it so the answer
 * reaches `CrawlLog` instead of only the operator who happened to be tailing
 * the runtime log within the hour.
 */
function loginVerdict(trace: AuthTrace): string {
  if (trace.probeBlocked) return "PROBE_BLOCKED";
  const reached = (re: RegExp) => trace.signals.some((s) => re.test(s));
  const lpoint = reached(/login_01_001/i);
  const sso = reached(/ssoLogin/i);
  if (!lpoint && !sso) return "GATE_BLOCKED";
  if (lpoint && !sso) return "SSO_NOT_ISSUED";
  return "SSO_REJECTED";
}

export async function performLogin(ctx: CrawlerContext) {
  const { page, credentials, log } = ctx;

  const trace = newAuthTrace();
  recordAuthTraffic(ctx, trace);

  log("[lotte] navigating to login page");
  await page.goto(LOTTE.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: LOTTE.timeouts.navigation,
  });

  // Cookie-consent banner shows once per fresh context — dismiss if present.
  // It is not necessarily inside `overlaySelector`, so it keeps its own click.
  try {
    await page
      .getByRole("button", { name: LOTTE.login.cookieConsentButtonName })
      .click({ timeout: 5_000 });
    log("[lotte] cookie consent accepted");
  } catch {
    /* banner absent — fine */
  }

  // Dismiss-then-click, retried: the layer can arrive after the dismissal and
  // before the click. One long click timeout cannot recover from that — it
  // just spends 20s retrying against an overlay nobody closed.
  log("[lotte] switching to L.POINT tab");
  const seen = { logged: false };
  const tab = page.getByText(LOTTE.login.tabName, { exact: false }).first();
  for (let attempt = 1; ; attempt++) {
    await dismissOverlay(ctx, seen);
    try {
      await tab.click({ timeout: LOTTE.login.tabClickTimeoutMs });
      break;
    } catch {
      if (attempt >= LOTTE.login.tabClickAttempts) {
        // Last resort: dispatch the click on the element itself. This skips
        // the hit test the overlay is winning, so it switches the tab even
        // while the layer is up. It is not a fix — if the layer also blocks
        // the submit button the next step fails — but it gets the run past a
        // layer we have not learned to close yet, and it says so in the log.
        log("[lotte] tab click still blocked — dispatching a DOM click");
        await tab.evaluate((el) => (el as HTMLElement).click(), undefined, {
          timeout: LOTTE.login.tabClickTimeoutMs,
        });
        break;
      }
      log("[lotte] tab click blocked, retrying", { attempt });
    }
  }

  // Do not fill until the tab reports itself selected — see tabSelectedSelector.
  await page
    .locator(LOTTE.login.tabSelectedSelector)
    .waitFor({ state: "attached", timeout: LOTTE.timeouts.navigation });

  log("[lotte] filling login form");
  const idInput = page.locator(LOTTE.login.idInputSelector);
  await idInput.waitFor({ state: "visible", timeout: LOTTE.timeouts.navigation });
  await idInput.fill(credentials.id);
  await page.locator(LOTTE.login.pwInputSelector).fill(credentials.pw);
  await page
    .getByRole("button", { name: LOTTE.login.submitButtonName, exact: true })
    .click({ timeout: 5_000 });
  log("[lotte] login submitted");

  // The SPA may or may not navigate — verify via the session API instead of DOM.
  log("[lotte] waiting for authenticated session");
  const deadline = Date.now() + LOTTE.timeouts.login;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1_500);
    if (await checkLoggedIn(ctx, trace)) {
      log("[lotte] login success");
      return;
    }
  }

  // Diagnostics before giving up: what does the page show?
  const pageUrl = page.url();
  let alertText = "";
  try {
    const alerts = await page
      .locator("[role='alert'], [class*='error'], [class*='alert'], .toast, [class*='valid']")
      .allInnerTexts();
    alertText = alerts.map((t) => t.trim()).filter(Boolean).join(" | ").slice(0, 300);
  } catch {
    /* diagnostics only */
  }
  // The alert selectors above have come back empty on every production
  // failure so far, so fall back to what the page actually renders. A
  // screenshot is the natural tool here and is useless on Vercel — nothing
  // reads /tmp afterwards — while body text lands in the log next to the
  // error. Input values are not part of innerText, so no credential rides
  // along with it.
  let bodyText = "";
  try {
    bodyText = (await page.locator("body").innerText())
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400);
  } catch {
    /* diagnostics only */
  }
  log("[lotte] login failed — page says", { url: pageUrl, alertText, bodyText });
  // Which of the four hops did we reach? Missing `login_01_001` means L.POINT
  // never authenticated us; missing `ssoLogin` means it did and lottehotel.com
  // refused to adopt the session; neither appearing at all points at the gate
  // in front of the form rather than at the form.
  log("[lotte] login failed — auth traffic", {
    hops: trace.hops,
    signals: trace.signals,
  });
  let botCookies: string[] = [];
  try {
    botCookies = (await ctx.context.cookies())
      .map((c) => c.name)
      .filter((n) => /reese84|incap|nlbi|netfunnel/i.test(n));
    log("[lotte] login failed — bot-protection cookies", { present: botCookies });
  } catch {
    /* diagnostics only */
  }

  if (process.env.CRAWLER_DEBUG_DIR) {
    try {
      await page.screenshot({
        path: `${process.env.CRAWLER_DEBUG_DIR}/lotte-login-failed.png`,
      });
    } catch {
      /* diagnostics only */
    }
  }
  // Everything above this line goes to stdout, which on Vercel Hobby is gone in
  // an hour. What the throw carries is what `CrawlLog` keeps, so it carries the
  // verdict and the evidence the verdict was read from — capped, because this
  // string is also rendered in a toast and in the crawl-logs table.
  const verdict = loginVerdict(trace);
  const evidence = [
    trace.signals.length ? `hops=${trace.signals.join(" ")}` : "hops=none",
    trace.probeBlocked ? `probe=${trace.probeBlocked}` : "",
    botCookies.length ? `bot=${dedupeCookieFamilies(botCookies).join(",")}` : "bot=none",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 200);
  throw new Error(
    `LOGIN_FAILED[${verdict}]: isLogin이 계속 false. ${evidence} url=${pageUrl}` +
      (alertText ? ` page_alerts="${alertText.slice(0, 80)}"` : ""),
  );
}

/**
 * `visid_incap_3207427` and `visid_incap_3184905` are the same fact twice —
 * Imperva issues one per protected site id, and this login touches four. The
 * question the error answers is which gatekeepers were present, not how many
 * site ids they cover.
 */
function dedupeCookieFamilies(names: string[]): string[] {
  const families = new Set<string>();
  for (const n of names) {
    if (/reese84/i.test(n)) families.add("reese84");
    else if (/visid_incap/i.test(n)) families.add("visid_incap");
    else if (/incap_ses/i.test(n)) families.add("incap_ses");
    else if (/nlbi/i.test(n)) families.add("nlbi");
    else if (/netfunnel/i.test(n)) families.add("netfunnel");
    else families.add(n.slice(0, 16));
  }
  return [...families].slice(0, 6);
}
