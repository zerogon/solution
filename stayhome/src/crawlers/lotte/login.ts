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

export async function performLogin(ctx: CrawlerContext) {
  const { page, credentials, log } = ctx;

  log("[lotte] navigating to login page");
  await page.goto(LOTTE.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: LOTTE.timeouts.navigation,
  });

  // Cookie-consent banner shows once per fresh context — dismiss if present.
  try {
    await page
      .getByRole("button", { name: LOTTE.login.cookieConsentButtonName })
      .click({ timeout: 5_000 });
    log("[lotte] cookie consent accepted");
  } catch {
    /* banner absent — fine */
  }

  log("[lotte] switching to L.POINT tab");
  await page
    .getByText(LOTTE.login.tabName, { exact: false })
    .first()
    .click({ timeout: LOTTE.timeouts.navigation });

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
