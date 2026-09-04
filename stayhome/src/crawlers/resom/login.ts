import type { CrawlerContext } from "../types";
import { RESOM } from "./config";

/** `POST {apiBase}/auth/login` — the only place the bearer token appears. */
interface LoginResponse {
  accessToken?: string;
  member?: { intnetId?: string; memNo?: string; memInd?: string };
}

/** `GET {apiBase}/auth/info` — identity for an already-authenticated session. */
interface AuthInfoResponse {
  member?: { memNo?: string; memInd?: string };
}

export interface ResomAuth {
  token: string;
  loginId: string;
}

export interface ResomMember {
  memNo: string;
  memInd: string;
}

/**
 * Read the token this crawler stashed at login.
 *
 * The site keeps its own copy in localStorage, AES-encrypted with a constant
 * app passphrase. We deliberately don't read that: it would tie the crawler to
 * an obfuscation detail of their front-end build, and it can only be reached
 * after navigating to the origin. Our cookie rides in the same `storageState`
 * and is readable straight from the context.
 */
export async function readAuth(ctx: CrawlerContext): Promise<ResomAuth | null> {
  const cookies = await ctx.context.cookies(RESOM.baseUrl);
  const raw = cookies.find((c) => c.name === RESOM.auth.cookieName)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as ResomAuth;
    return parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

async function storeAuth(ctx: CrawlerContext, auth: ResomAuth): Promise<void> {
  await ctx.context.addCookies([
    {
      name: RESOM.auth.cookieName,
      value: Buffer.from(JSON.stringify(auth), "utf8").toString("base64"),
      domain: RESOM.auth.cookieDomain,
      path: "/",
      httpOnly: false,
      secure: true,
      // Outlive the 6h session TTL so the cookie is never the thing that
      // expires first — `checkLoggedIn` decides validity, not the clock.
      expires: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
    },
  ]);
}

export function authHeaders(auth: ResomAuth): Record<string, string> {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${auth.token}`,
    "login-id": auth.loginId,
    "user-device": RESOM.auth.userDevice,
    Referer: RESOM.bookingUrl,
  };
}

/**
 * Fetch the member number and membership type, or null when unauthenticated.
 *
 * Doubles as the session probe, and every `calendarRooms` request needs both
 * values anyway. They are read per pass rather than pinned in config because
 * they are per-account — the same reason SONO re-reads its `memNo`.
 */
export async function fetchMember(ctx: CrawlerContext): Promise<ResomMember | null> {
  const auth = await readAuth(ctx);
  if (!auth) return null;
  const res = await ctx.page.request.get(`${RESOM.apiBase}/auth/info`, {
    timeout: RESOM.timeouts.api,
    headers: authHeaders(auth),
  });
  if (!res.ok()) return null;
  const body = (await res.json()) as AuthInfoResponse;
  const memNo = body.member?.memNo;
  const memInd = body.member?.memInd;
  return memNo && memInd ? { memNo, memInd } : null;
}

export async function checkLoggedIn(ctx: CrawlerContext): Promise<boolean> {
  const { log } = ctx;
  try {
    const member = await fetchMember(ctx);
    // Don't log the member number — it identifies the corporate account.
    log("[resom] auth/info probe", { authenticated: member != null });
    return member != null;
  } catch (e) {
    // Never rethrow: run.ts wraps validateSession in a deadline, and an
    // escaping error would abort the crawl before login is even attempted.
    log("[resom] session validation failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

export async function performLogin(ctx: CrawlerContext) {
  const { page, credentials, log } = ctx;

  log("[resom] navigating to login page");
  await page.goto(RESOM.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: RESOM.timeouts.navigation,
  });

  log("[resom] filling login form");
  const idInput = page.locator(RESOM.login.idInputSelector);
  await idInput.waitFor({ state: "visible", timeout: RESOM.timeouts.navigation });
  await idInput.fill(credentials.id);
  await page.locator(RESOM.login.pwInputSelector).first().fill(credentials.pw);

  // Start listening before clicking: the token is in the login response and
  // nowhere else we are willing to read, so missing it is a failed login even
  // if the SPA navigates happily afterwards.
  const responsePromise = page
    .waitForResponse(
      (res) => res.url().startsWith(`${RESOM.apiBase}/auth/login`) && res.request().method() === "POST",
      { timeout: RESOM.timeouts.login },
    )
    .catch(() => null);

  await page.locator(RESOM.login.submitSelector).first().click({ timeout: 8_000 });

  const response = await responsePromise;
  let body: LoginResponse | null = null;
  if (response) {
    try {
      body = (await response.json()) as LoginResponse;
    } catch {
      body = null;
    }
  }

  const token = body?.accessToken;
  const loginId = body?.member?.intnetId;
  if (token && loginId) {
    await storeAuth(ctx, { token, loginId });
    log("[resom] login success", { tokenChars: token.length });
    return;
  }

  // Diagnostics before giving up. A login that fails here fails quietly — the
  // SPA shows a dialog and stays on the page — so the page's own words are the
  // only thing that separates a wrong password from a blocked account.
  const pageUrl = page.url();
  const status = response?.status();
  let bodyText = "";
  try {
    bodyText = (await page.locator("body").innerText())
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
  } catch {
    /* diagnostics only */
  }
  if (process.env.CRAWLER_DEBUG_DIR) {
    try {
      await page.screenshot({ path: `${process.env.CRAWLER_DEBUG_DIR}/resom-login-failed.png` });
    } catch {
      /* diagnostics only */
    }
  }
  log("[resom] login failed — page says", { url: pageUrl, status, bodyText });
  throw new Error(
    `LOGIN_FAILED: auth/login이 토큰을 주지 않음. url=${pageUrl}` +
      (status ? ` status=${status}` : " (응답 없음)"),
  );
}
