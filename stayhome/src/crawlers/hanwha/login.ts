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
  const { log } = ctx;
  // 두 번까지. 재시도는 **전송이 실패했을 때만**이고, `resultCode`를 실제로 받은
  // 경우는 첫 답이 최종이다 — 아래 `askSessionCheck`가 그 구분을 반환한다.
  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await askSessionCheck(ctx);
    if (answer !== "unheard") return answer;
    if (attempt === 0) {
      log("[hanwha] sessionCheck 응답을 듣지 못함 — 1회 재시도");
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }
  // 두 번 다 못 들었으면 세션을 신뢰할 수 없다. 여기서 true를 반환하면
  // 화면1만 통과한 상태로 크롤에 들어가고, 그때 사이트는 에러가 아니라
  // **익명 달력**을 준다 — 조용히 틀린 재고가 발행된다.
  return false;
}

/**
 * 한 번 물어보고, 사이트가 **답했는지**까지 함께 반환한다.
 *
 * 종전에는 셋이 전부 `false`로 접혔다: ① `resultCode !== 0`(사이트가 답했고
 * 로그인 아님) ② 502/503 ③ 타임아웃·`ERR_INSUFFICIENT_RESOURCES`·브라우저 사망.
 * ②③은 세션에 대해 **아무 말도 하지 않은 것**인데, 이 크롤러에서 "만료"의 값은
 * 2화면 콜드 로그인이다.
 *
 * 2026-08-26 09:03이 그 값을 치른 자리다 — 70초 전에 저장한 세션이 false를 받아
 * 풀 로그인으로 갔고, 그 로그인이 `#id` 25초 타임아웃으로 죽었다. 같은 세션을
 * 다시 만든 09:05:13분은 이후 90초 넘게 세 패스를 버텼으므로, 70초에 죽는
 * 세션이 아니었다. 그 false는 만료가 아니라 굶주린 브라우저였다.
 *
 * 절대 rethrow하지 않는다: `run.ts`가 `validateSession`을 deadline으로 감싸고,
 * 여기서 새어 나간 예외는 로그인을 시도조차 못 하게 만든다.
 */
async function askSessionCheck(
  ctx: CrawlerContext,
): Promise<boolean | "unheard"> {
  const { page, log } = ctx;
  try {
    const res = await page.request.post(HANWHA.sessionCheckUrl, {
      timeout: HANWHA.timeouts.api,
      headers: { Referer: HANWHA.baseUrl },
    });
    if (!res.ok()) {
      log("[hanwha] sessionCheck not ok", { status: res.status() });
      return "unheard";
    }
    const body = (await res.json()) as SessionCheckResponse;
    log("[hanwha] sessionCheck", { resultCode: body.resultCode ?? null });
    // `-1`은 화면1만 통과한 상태다. 사이트가 답한 값이므로 재시도 대상이 아니다.
    return body.resultCode === 0;
  } catch (e) {
    log("[hanwha] session validation failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return "unheard";
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
  const formShown = await idInput
    .waitFor({ state: "visible", timeout: HANWHA.timeouts.navigation })
    .then(() => true)
    .catch(() => false);

  if (!formShown) {
    // 폼이 없다는 것이 곧 실패는 아니다 — **이미 로그인돼 있으면** 사이트가
    // 로그인 화면을 그리지 않는다. 그러면 `#id`는 영원히 나타나지 않고, 25초를
    // 기다린 끝에 나오는 것은 자격증명 오류와 구별되지 않는 타임아웃이다.
    //
    // 2026-08-25 09:02:47과 08-26 09:03:04의 프로덕션 실패가 정확히 이 모양이다.
    // 두 경우 다 `checkLoggedIn`이 (사이트의 답이 아니라 전송 실패로) false를
    // 냈고, `run.ts`는 그것을 만료로 읽어 로그인을 시켰고, 멀쩡한 세션 위에서
    // 로그인 화면을 기다리다 죽었다. 즉 이 크롤러는 **자기가 이미 통과한 상태를
    // 실패로 신고**하고 있었다.
    //
    // 예약 호스트를 잃어 `run.ts`가 재로그인을 요청하는 경우도 같은 자리로 온다.
    // 거기서 필요한 것은 `www` 재인증이 아니라 `bootSession`의 재시도이고,
    // 그건 이 함수가 반환한 **뒤에** 일어난다.
    if (await checkLoggedIn(ctx)) {
      log("[hanwha] 로그인 폼이 없다 — 이미 인증된 세션이다 (로그인 생략)");
      return;
    }
    await dumpLoginFailure(ctx, "no-form");
    throw new Error(
      `LOGIN_FAILED: 로그인 폼이 뜨지 않았고 세션도 없다 (대기열 또는 차단). url=${page.url()}`,
    );
  }

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
