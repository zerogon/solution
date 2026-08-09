import type { CrawlerContext } from "../types";
import { LOTTE } from "./config";

/**
 * Probe the session via the isLogin endpoint. `page.request` shares the
 * browser context's cookies, so this validates a restored storageState without
 * any page navigation.
 */
export async function checkLoggedIn(ctx: CrawlerContext): Promise<boolean> {
  const { page, log } = ctx;
  try {
    const res = await page.request.get(LOTTE.isLoginUrl, {
      timeout: LOTTE.timeouts.api,
      headers: { Accept: "application/json" },
    });
    if (!res.ok()) return false;
    const body = (await res.json()) as { code?: string; data?: boolean };
    log("[lotte] isLogin probe", { code: body.code, data: body.data });
    return body.data === true;
  } catch (e) {
    log("[lotte] session validation failed", {
      error: e instanceof Error ? e.message : String(e),
    });
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
 * Bodies are only captured for non-2xx or HTML responses: a challenge page or
 * an error is the informative case, while the successful JSON carries the
 * account's login id and is worth nothing in a log.
 */
function recordAuthTraffic(ctx: CrawlerContext): string[] {
  const seen: string[] = [];
  const wanted = /netfunnel|lpoint|ssoLogin|\/login/i;
  ctx.page.on("response", async (res) => {
    const url = res.url();
    if (!wanted.test(url) || /\.(js|css|png|jpg|gif|svg|woff2?)(\?|$)/i.test(url)) return;
    const contentType = res.headers()["content-type"] ?? "";
    let snippet = "";
    if (res.status() >= 300 || contentType.includes("html")) {
      try {
        snippet = (await res.text()).replace(/\s+/g, " ").slice(0, 160);
      } catch {
        /* body already consumed */
      }
    }
    if (seen.length < 12) {
      seen.push(`${res.status()} ${res.request().method()} ${url.slice(0, 120)}${snippet ? ` :: ${snippet}` : ""}`);
    }
  });
  return seen;
}

export async function performLogin(ctx: CrawlerContext) {
  const { page, credentials, log } = ctx;

  const authTraffic = recordAuthTraffic(ctx);

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
    if (await checkLoggedIn(ctx)) {
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
  log("[lotte] login failed — auth traffic", { hops: authTraffic });
  try {
    const cookies = await ctx.context.cookies();
    log("[lotte] login failed — bot-protection cookies", {
      present: cookies
        .map((c) => c.name)
        .filter((n) => /reese84|incap|nlbi|netfunnel/i.test(n)),
    });
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
  throw new Error(
    `LOGIN_FAILED: isLogin이 계속 false. url=${pageUrl}` +
      (alertText ? ` page_alerts="${alertText}"` : ""),
  );
}
