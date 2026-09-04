import type { CrawlerContext } from "../types";
import { OAKVALLEY } from "./config";

/** `GET common.session.pns?sessionCheck` — the JSP host's own answer. */
interface SessionCheckResponse {
  session?: Array<{ session_yn?: string }>;
}

/** `POST {apiBase}/users/sign-in` — only `data.access_token` is read. */
interface SignInResponse {
  data?: { access_token?: string };
}

/**
 * Is the reservation host's session alive?
 *
 * Probes the **JSP** host, not the SPA. Search consumes the `JSESSIONID`, and a
 * live `oak-token` sitting next to a dead Tomcat session has to read as invalid
 * or every pass would skip login and then collect nothing.
 *
 * One request, no navigation — the same shape SONO and RESOM validate with.
 */
export async function checkLoggedIn(ctx: CrawlerContext): Promise<boolean> {
  const { page, log } = ctx;
  try {
    const res = await page.request.get(OAKVALLEY.sessionCheckUrl, {
      timeout: OAKVALLEY.timeouts.api,
      headers: { Referer: OAKVALLEY.condoUrl },
    });
    if (!res.ok()) {
      log("[oakvalley] sessionCheck not ok", { status: res.status() });
      return false;
    }
    const body = (await res.json()) as SessionCheckResponse;
    const yn = body.session?.[0]?.session_yn;
    log("[oakvalley] sessionCheck", { session_yn: yn ?? null });
    return yn === "Y";
  } catch (e) {
    // Never rethrow: run.ts wraps validateSession in a deadline, and an escaping
    // error would abort the crawl before login is even attempted.
    log("[oakvalley] session validation failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

/**
 * Log in on the SPA, then confirm the reservation host came along.
 *
 * There is no bridge to walk: the SPA POSTs `frontMember.pns?login-oak` to
 * `reservation.oakvalley.co.kr` as part of signing in, and `sessionCheck`
 * answers `Y` straight afterwards without any navigation to that host. What this
 * function must NOT do is return before that has happened — `run.ts` calls
 * `saveStorageState` the instant `login()` resolves, and a state saved a moment
 * too early carries the `oak-token` but no `JSESSIONID`, which is exactly the
 * session that then fails validation on every later pass.
 *
 * Hence the poll rather than a single check: the handoff is a second request the
 * SPA fires on its own schedule, and one probe would race it.
 */
export async function performLogin(ctx: CrawlerContext): Promise<void> {
  const { page, credentials, log } = ctx;

  log("[oakvalley] navigating to login page");
  await page.goto(OAKVALLEY.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: OAKVALLEY.timeouts.navigation,
  });

  const idInput = page.locator(OAKVALLEY.login.idInputSelector);
  await idInput.waitFor({ state: "visible", timeout: OAKVALLEY.timeouts.navigation });
  await idInput.fill(credentials.id);
  await page.locator(OAKVALLEY.login.pwInputSelector).first().fill(credentials.pw);

  // Armed before the click: the response is the only place the outcome is
  // stated. The SPA reports a bad password with a dialog and stays put, so
  // without this a wrong credential and a blocked account look the same.
  const responsePromise = page
    .waitForResponse(
      (res) =>
        OAKVALLEY.signInUrlPattern.test(res.url()) && res.request().method() === "POST",
      { timeout: OAKVALLEY.timeouts.login },
    )
    .catch(() => null);

  await page.locator(OAKVALLEY.login.submitSelector).first().click({ timeout: 8_000 });

  const response = await responsePromise;
  let token: string | undefined;
  if (response) {
    try {
      token = ((await response.json()) as SignInResponse).data?.access_token;
    } catch {
      token = undefined;
    }
  }

  if (!token) {
    await dumpLoginFailure(ctx, response?.status());
    throw new Error(
      `LOGIN_FAILED: sign-in이 토큰을 주지 않음. url=${page.url()}` +
        (response ? ` status=${response.status()}` : " (응답 없음)"),
    );
  }
  log("[oakvalley] sign-in ok", { tokenChars: token.length });

  for (let attempt = 1; attempt <= 5; attempt++) {
    if (await checkLoggedIn(ctx)) {
      log("[oakvalley] reservation host session established", { attempt });
      return;
    }
    await page.waitForTimeout(1_500);
  }

  // The interesting failure, and invisible without splitting it from the one
  // above: the credential was accepted but the reservation host never got a
  // session. That is a site-side handoff problem, not a password problem.
  await dumpLoginFailure(ctx, response?.status());
  throw new Error(
    `LOGIN_FAILED: 토큰은 받았으나 예약 호스트 session_yn이 Y가 되지 않음. url=${page.url()}`,
  );
}

async function dumpLoginFailure(ctx: CrawlerContext, status?: number) {
  const { page, log } = ctx;
  let bodyText = "";
  try {
    bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim().slice(0, 300);
  } catch {
    /* diagnostics only */
  }
  if (process.env.CRAWLER_DEBUG_DIR) {
    try {
      await page.screenshot({
        path: `${process.env.CRAWLER_DEBUG_DIR}/oakvalley-login-failed.png`,
      });
    } catch {
      /* diagnostics only */
    }
  }
  log("[oakvalley] login failed — page says", { url: page.url(), status, bodyText });
}
