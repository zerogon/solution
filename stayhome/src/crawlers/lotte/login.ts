import type { CrawlerContext } from "../types";
import { LOTTE } from "./config";

async function openMenu(ctx: CrawlerContext) {
  const { page } = ctx;
  await page
    .getByRole("button", { name: LOTTE.login.menuButtonName })
    .click({ timeout: LOTTE.timeouts.modalOpen });
}

async function isLoggedInVisible(ctx: CrawlerContext): Promise<boolean> {
  const { page } = ctx;
  for (const text of LOTTE.login.loggedInTexts) {
    if ((await page.getByText(text, { exact: false }).count()) > 0) {
      return true;
    }
  }
  return false;
}

export async function performLogin(ctx: CrawlerContext) {
  const { page, credentials, log } = ctx;

  log("[lotte] navigating to main");
  await page.goto(LOTTE.mainUrl, {
    waitUntil: "domcontentloaded",
    timeout: LOTTE.timeouts.navigation,
  });

  log("[lotte] opening menu → login");
  await openMenu(ctx);
  await page
    .getByRole("link", { name: LOTTE.login.loginLinkName })
    .click({ timeout: LOTTE.timeouts.modalOpen });

  log("[lotte] filling login form");
  const idBox = page.getByRole("textbox", { name: LOTTE.login.idTextboxName });
  await idBox.fill(credentials.id);
  await idBox.press("Tab");
  await page
    .getByRole("textbox", { name: LOTTE.login.pwTextboxName })
    .fill(credentials.pw);
  await page
    .getByRole("textbox", { name: LOTTE.login.pwTextboxName })
    .press("Enter");

  // "다음에 변경" 비밀번호 변경 권유 모달 — 없으면 무시
  try {
    await page
      .getByRole("button", { name: LOTTE.login.postLoginDismissButtonName })
      .click({ timeout: 3_000 });
    log("[lotte] dismissed post-login reminder");
  } catch {
    /* modal absent — fine */
  }

  log("[lotte] waiting for logged-in indicator");
  await page.waitForLoadState("domcontentloaded", {
    timeout: LOTTE.timeouts.login,
  });

  // 메뉴를 다시 열어 로그아웃 텍스트 확인 (최상단 nav는 이미 갱신됐을 수 있음)
  if (!(await isLoggedInVisible(ctx))) {
    await openMenu(ctx);
    if (!(await isLoggedInVisible(ctx))) {
      throw new Error("LOGIN_FAILED: 로그인 후 indicator 텍스트(로그아웃/마이페이지)를 찾지 못함");
    }
  }
  log("[lotte] login success");
}

export async function checkLoggedIn(ctx: CrawlerContext): Promise<boolean> {
  const { page, log } = ctx;
  try {
    log("[lotte] validating cached session");
    await page.goto(LOTTE.mainUrl, {
      waitUntil: "domcontentloaded",
      timeout: LOTTE.timeouts.navigation,
    });
    if (await isLoggedInVisible(ctx)) return true;
    // 메뉴를 열어 한 번 더 확인
    await openMenu(ctx);
    return await isLoggedInVisible(ctx);
  } catch (e) {
    log("[lotte] session validation failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
