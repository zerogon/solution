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
 * An undismissed layer does not fail where it is raised — it fails 20s later
 * on the L.POINT tab click, reported as `.modal-dimm ... intercepts pointer
 * events`, which reads like a broken tab selector. So when no candidate
 * matches, the layer's own heading and buttons go to the log: an overlay that
 * only appears from some regions is otherwise invisible from here.
 */
async function dismissOverlay(ctx: CrawlerContext): Promise<void> {
  const { page, log } = ctx;
  const layer = page.locator(LOTTE.login.overlaySelector).first();
  // Give a late layer a moment to show itself. Without this the check ran
  // before the layer existed, returned quietly, and the layer arrived in the
  // middle of the tab click instead.
  await layer
    .waitFor({ state: "visible", timeout: LOTTE.login.overlayAppearMs })
    .catch(() => {});
  if (!(await layer.isVisible().catch(() => false))) return;

  for (const name of LOTTE.login.overlayDismissButtonNames) {
    const button = layer.getByRole("button", { name, exact: false }).first();
    if (!(await button.count().catch(() => 0))) continue;
    try {
      await button.click({ timeout: 3_000 });
      log("[lotte] overlay dismissed", { via: name });
      await layer.waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
      if (!(await layer.isVisible().catch(() => false))) return;
    } catch {
      /* candidate did not take — try the next one */
    }
  }

  let heading = "";
  let buttons: string[] = [];
  try {
    heading = (await layer.innerText()).replace(/\s+/g, " ").trim().slice(0, 200);
    buttons = (await layer.locator("button, a[role='button']").allInnerTexts())
      .map((t) => t.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 12);
  } catch {
    /* diagnostics only */
  }
  log("[lotte] overlay still open — no dismiss candidate matched", { heading, buttons });
}

export async function performLogin(ctx: CrawlerContext) {
  const { page, credentials, log } = ctx;

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
  const tab = page.getByText(LOTTE.login.tabName, { exact: false }).first();
  for (let attempt = 1; ; attempt++) {
    await dismissOverlay(ctx);
    try {
      await tab.click({ timeout: LOTTE.login.tabClickTimeoutMs });
      break;
    } catch (e) {
      if (attempt >= LOTTE.login.tabClickAttempts) throw e;
      log("[lotte] tab click blocked, retrying", { attempt });
    }
  }

  log("[lotte] filling login form");
  const idInput = page.locator(LOTTE.login.idInputSelector);
  await idInput.waitFor({ state: "visible", timeout: LOTTE.timeouts.navigation });
  await idInput.fill(credentials.id);
  await page.locator(LOTTE.login.pwInputSelector).fill(credentials.pw);
  await page
    .getByRole("button", { name: LOTTE.login.submitButtonName, exact: true })
    .click({ timeout: 5_000 });

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
