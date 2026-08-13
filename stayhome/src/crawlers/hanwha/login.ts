import type { CrawlerContext } from "../types";
import { HANWHA } from "./config";

/** `POST /irsweb/resort3/sessionCheck.do` — 0 means authenticated. */
interface SessionCheckResponse {
  resultCode?: number;
}

/**
 * Is the member site's session alive?
 *
 * One request, no navigation — the shape SONO, Resom and Oak Valley all
 * validate with. It probes `www`, not the booking host, because `www` is where
 * the two-screen login completes; the booking host mints its own session on
 * demand and `search.ts` is what notices if that fails.
 *
 * Load-bearing detail: this endpoint answers `-1` for a visitor who has passed
 * screen 1 but not screen 2. That is precisely the half-logged-in state this
 * site can leave us in, so `resultCode === 0` is the only accepted answer.
 */
export async function checkLoggedIn(ctx: CrawlerContext): Promise<boolean> {
  const { page, log } = ctx;
  try {
    const res = await page.request.post(HANWHA.sessionCheckUrl, {
      timeout: HANWHA.timeouts.api,
      headers: { Referer: HANWHA.baseUrl },
    });
    if (!res.ok()) {
      log("[hanwha] sessionCheck not ok", { status: res.status() });
      return false;
    }
    const body = (await res.json()) as SessionCheckResponse;
    log("[hanwha] sessionCheck", { resultCode: body.resultCode ?? null });
    return body.resultCode === 0;
  } catch (e) {
    // Never rethrow: run.ts wraps validateSession in a deadline, and an escaping
    // error would abort the crawl before login is even attempted.
    log("[hanwha] session validation failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

/**
 * Log in across both screens.
 *
 * ```
 * POST login.do                        #id / #pwd / #btnLogin
 *   ↓ site redirects
 * GET  login_membership_password.do    ← 회원인증
 * POST login_membership_password.do    #membership_password / 확인
 * ```
 *
 * The second screen is the one that matters. Before it, `sessionCheck.do`
 * answers `-1` and the booking host serves the anonymous calendar — where 240
 * of 450 rows at 설악 read 회원우선 instead of 예약가능. A crawler that treated
 * screen 1 as success would report a nearly-full resort and never say why.
 *
 * Three failures are separated on purpose. Collapsed into one they all read as
 * "wrong password", and this site has a gatekeeper family (NetFunnel, F5 ASM)
 * that can stop us before the form is ever submitted — the same misdiagnosis
 * Lotte cost us once already.
 */
export async function performLogin(ctx: CrawlerContext): Promise<void> {
  const { page, credentials, log } = ctx;
  const membershipPw = resolveMembershipPassword(credentials.memo);

  log("[hanwha] navigating to login page");
  await page.goto(HANWHA.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: HANWHA.timeouts.navigation,
  });

  const idInput = page.locator(HANWHA.login.idSelector);
  await idInput.waitFor({ state: "visible", timeout: HANWHA.timeouts.navigation });
  await idInput.fill(credentials.id);
  await page.locator(HANWHA.login.pwSelector).first().fill(credentials.pw);

  log("[hanwha] submitting credentials (screen 1/2)");
  await page.locator(HANWHA.login.submitSelector).first().click({ timeout: 8_000 });

  const reachedMembership = await page
    .waitForURL(HANWHA.membershipUrlPattern, { timeout: HANWHA.timeouts.login })
    .then(() => true)
    .catch(() => false);

  if (!reachedMembership) {
    // Two very different things land here. Accounts with no 회원권 비밀번호 set
    // are logged straight in and skip screen 2 entirely — that is a success, and
    // the site's own help text says as much. Everything else stopped before the
    // form was accepted.
    if (await checkLoggedIn(ctx)) {
      log("[hanwha] logged in without 회원인증 (no membership password on this account)");
      return;
    }
    await dumpLoginFailure(ctx, "screen1");
    throw new Error(
      `LOGIN_FAILED: 회원인증 화면에 도달하지 못했고 세션도 서지 않음 (자격증명 또는 대기열). url=${page.url()}`,
    );
  }

  log("[hanwha] 회원인증 screen reached (screen 2/2)", { pwChars: membershipPw.length });
  const memberPwInput = page.locator(HANWHA.login.membershipPwSelector);
  await memberPwInput.waitFor({ state: "visible", timeout: HANWHA.timeouts.navigation });
  // Blank is a legitimate value — the screen says so — so an empty memo fills
  // nothing rather than erroring.
  if (membershipPw) await memberPwInput.fill(membershipPw);
  await page.locator(HANWHA.login.membershipSubmitSelector).first().click({ timeout: 8_000 });
  await page.waitForLoadState("domcontentloaded", { timeout: HANWHA.timeouts.login }).catch(() => null);

  // Poll rather than probe once. run.ts calls saveStorageState the instant this
  // resolves, so returning a beat early persists a session that has cleared
  // screen 1 but not screen 2 — which then fails validation on every later pass
  // while looking, in the logs, like a session that simply expired.
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (await checkLoggedIn(ctx)) {
      log("[hanwha] login success", { attempt });
      return;
    }
    await page.waitForTimeout(1_500);
  }

  const stillOnMembership = HANWHA.membershipUrlPattern.test(page.url());
  await dumpLoginFailure(ctx, stillOnMembership ? "membership" : "session");
  throw new Error(
    stillOnMembership
      ? `LOGIN_FAILED: 회원권 비밀번호가 거부됨 (/admin/accounts의 한화 계정 메모 확인). url=${page.url()}`
      : `LOGIN_FAILED: 회원인증은 통과했으나 sessionCheck가 0이 되지 않음. url=${page.url()}`,
  );
}

/**
 * The 회원권 비밀번호, taken from `ResortAccount.memo`.
 *
 * Parsed strictly rather than leniently. The memo is a free-text field a person
 * edits, and the day it becomes `"회원권 비번 XXXX (2026-08 갱신)"` a lenient
 * reader would submit the whole sentence and the failure would surface as a
 * rejected password — pointing at the account rather than at the note. Failing
 * here says which one to go fix.
 *
 * (The example is deliberately not the real value: this repository is public,
 * and the point of keeping the secret in the DB is that it never lands here.)
 */
function resolveMembershipPassword(memo: string | undefined): string {
  const value = (memo ?? "").trim();
  if (value === "" || /^\d{4,15}$/.test(value)) return value;
  throw new Error(
    "LOGIN_FAILED: 한화 계정 메모가 회원권 비밀번호(숫자)가 아닙니다. " +
      "/admin/accounts에서 메모에 숫자만 남기세요 (미설정 계정은 비워 두면 됩니다).",
  );
}

async function dumpLoginFailure(ctx: CrawlerContext, stage: string) {
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
        path: `${process.env.CRAWLER_DEBUG_DIR}/hanwha-login-failed-${stage}.png`,
      });
    } catch {
      /* diagnostics only */
    }
  }
  // No HTML dump here, deliberately: the 회원인증 screen carries the account's
  // id and password back in hidden fields, so saving its markup would write
  // plaintext credentials to disk.
  log("[hanwha] login failed — page says", { stage, url: page.url(), bodyText });
}
