import type { CrawlerContext } from "../types";
import { SONO } from "./config";

/** `GET /management/auth/userinfo` — the only endpoint that reports identity. */
interface UserInfoResponse {
  success?: boolean;
  body?: { userInfo?: { memNo?: string } } | null;
}

/**
 * Fetch the logged-in member number, or null when the session isn't valid.
 *
 * Doubles as the session probe: `page.request` shares the browser context's
 * cookies, so this validates a restored storageState with no navigation, and
 * every room-list request needs the `memNo` anyway.
 */
export async function fetchMemberNo(ctx: CrawlerContext): Promise<string | null> {
  const { page } = ctx;
  const res = await page.request.get(
    `${SONO.apiBase}/management/auth/userinfo?lang=ko&deviceType=PC&mobileAppYn=N`,
    { timeout: SONO.timeouts.api, headers: { Accept: "application/json" } },
  );
  if (!res.ok()) return null;
  const body = (await res.json()) as UserInfoResponse;
  return body.body?.userInfo?.memNo ?? null;
}

export async function checkLoggedIn(ctx: CrawlerContext): Promise<boolean> {
  const { log } = ctx;
  try {
    const memNo = await fetchMemberNo(ctx);
    // Don't log the member number — it identifies the corporate account.
    log("[sono] userinfo probe", { authenticated: memNo != null });
    return memNo != null;
  } catch (e) {
    // Never rethrow: run.ts wraps validateSession in a deadline, and an
    // escaping error would abort the crawl before login is even attempted.
    log("[sono] session validation failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

export async function performLogin(ctx: CrawlerContext) {
  const { page, credentials, log } = ctx;

  log("[sono] navigating to login page");
  await page.goto(SONO.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: SONO.timeouts.navigation,
  });

  // Promo overlay / cookie bar. `exact` is deliberate: a substring match on
  // "확인" also hits the "로그인 안내" dialog, whose 확인 navigates away.
  for (const name of SONO.login.dismissButtonNames) {
    try {
      await page.getByRole("button", { name, exact: true }).first().click({ timeout: 3_000 });
      log("[sono] dismissed overlay", { name });
    } catch {
      /* absent — fine */
    }
  }

  log("[sono] filling login form");
  const idInput = page.locator(SONO.login.idInputSelector);
  await idInput.waitFor({ state: "visible", timeout: SONO.timeouts.navigation });
  await idInput.fill(credentials.id);
  await page.locator(SONO.login.pwInputSelector).fill(credentials.pw);

  // The page has no <form>, and the site header carries a 로그인 link with the
  // same accessible name as the submit button. Scope to the password field's
  // container so we press the form's own button, and fall back to the last
  // match (header links come first in DOM order).
  const scoped = page
    .locator(`${SONO.login.pwInputSelector} >> xpath=ancestor::*[self::div or self::section][3]`)
    .getByRole("button", { name: SONO.login.submitButtonName })
    .last();
  try {
    await scoped.click({ timeout: 5_000 });
  } catch {
    await page
      .getByRole("button", { name: SONO.login.submitButtonName, exact: true })
      .last()
      .click({ timeout: 8_000 });
  }

  // The SPA doesn't reliably navigate — verify via the session API, not DOM.
  log("[sono] waiting for authenticated session");
  const deadline = Date.now() + SONO.timeouts.login;
  while (Date.now() < deadline) {
    await page.waitForTimeout(1_500);
    if (await checkLoggedIn(ctx)) {
      log("[sono] login success");
      return;
    }
  }

  // Diagnostics before giving up: this is the only window into a repeated
  // real-site login failure.
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
        path: `${process.env.CRAWLER_DEBUG_DIR}/sono-login-failed.png`,
      });
    } catch {
      /* diagnostics only */
    }
  }
  throw new Error(
    `LOGIN_FAILED: userinfo가 계속 미인증. url=${pageUrl}` +
      (alertText ? ` page_alerts="${alertText}"` : ""),
  );
}
