import type { CrawlerContext } from "../types";
import { KENSINGTON } from "./config";

/**
 * 저장된 세션이 아직 분양회원으로 통하는가.
 *
 * 로그인 표지(`로그아웃` 링크)가 아니라 **실제로 쓸 페이지**를 본다 — 재고 콜이 요구하는
 * 것은 "로그인됨"이 아니라 "회원번호를 고를 수 있음"이다. 익명이면 이 페이지는 302 → `/`.
 */
export async function checkLoggedIn(ctx: CrawlerContext): Promise<boolean> {
  try {
    const res = await ctx.page.request.get(KENSINGTON.memberPageUrl, {
      maxRedirects: 0,
      timeout: KENSINGTON.timeouts.navigation,
    });
    if (res.status() !== 200) return false;
    return (await res.text()).includes("membno_select(");
  } catch {
    return false;
  }
}

/**
 * 무기명(법인) 회원 로그인.
 *
 * 사이트의 `login_corp()`를 그대로 부르지 않는다 — 성공하면 곧바로 `location.href`로 이동해
 * 응답 본문을 읽기 전에 리소스가 사라진다(2026-10-18 실측). 대신 폼에 값을 채우고
 * `send_login()`과 **같은 요청**(`$("#frm_corp").serialize()` → POST)을 페이지 안 `fetch`로
 * 보내 JSON을 직접 읽는다. 쿠키·리퍼러는 브라우저 것이 그대로 실린다.
 *
 * 재시도하지 않는다. 법인 실계정이라 반복 실패는 잠금 위험이 있고, 403은 사이트가
 * "회원관리팀 문의"로 안내하는 별개 실패다.
 */
export async function performLogin(ctx: CrawlerContext): Promise<void> {
  const { page, credentials, log } = ctx;

  await page.goto(KENSINGTON.loginUrl, {
    waitUntil: "domcontentloaded",
    timeout: KENSINGTON.timeouts.navigation,
  });
  await page.locator(KENSINGTON.login.idInputSelector).fill(credentials.id);
  await page.locator(KENSINGTON.login.pwInputSelector).fill(credentials.pw);

  const { status, body } = await page.evaluate(
    async ({ formSelector, url, timeoutMs }) => {
      const form = document.querySelector<HTMLFormElement>(formSelector);
      if (!form) return { status: -1, body: "form missing" };
      const data = new URLSearchParams();
      new FormData(form).forEach((v, k) => data.append(k, String(v)));
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const r = await fetch(url, {
          method: "POST",
          body: data,
          headers: { "X-Requested-With": "XMLHttpRequest" },
          credentials: "same-origin",
          signal: ctrl.signal,
        });
        return { status: r.status, body: await r.text() };
      } finally {
        clearTimeout(timer);
      }
    },
    {
      formSelector: KENSINGTON.login.formSelector,
      url: KENSINGTON.loginApiUrl,
      timeoutMs: KENSINGTON.timeouts.login,
    },
  );

  if (status === 403) {
    throw new Error("LOGIN_FAILED: 403 — 사이트가 로그인을 거부했다(회원관리팀 문의 안내)");
  }
  let parsed: { com_yn?: string } = {};
  try {
    parsed = JSON.parse(body);
  } catch {
    /* handled below */
  }
  if (status !== 200 || parsed.com_yn !== "Y") {
    // 본문에는 자격증명이 없다(`{com_yn, ret_url}`). 그래도 길이만 남긴다.
    throw new Error(
      `LOGIN_FAILED: status=${status} com_yn=${parsed.com_yn ?? "-"} bodyLen=${body.length}`,
    );
  }

  // 로그인 직후에 회원 페이지까지 열려야 성공이다. 법인 계정이 분양회원 경로를 못 쓰는
  // 상태(회원권 만료 등)를 로그인 단계에서 잡아야 검색 단계의 SESSION_LOST로 오독되지 않는다.
  if (!(await checkLoggedIn(ctx))) {
    throw new Error("LOGIN_FAILED: 로그인은 됐지만 분양회원 예약 페이지가 열리지 않는다");
  }
  log("[kensington] corporate login ok");
}
