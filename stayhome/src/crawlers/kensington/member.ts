import type { Page } from "playwright-core";
import { SessionLostError } from "../_shared/errors";
import type { CrawlerContext } from "../types";
import { KENSINGTON } from "./config";

/**
 * 이 패스가 쓸 분양회원번호(full, `memb_no`로 가는 값).
 *
 * config에 박지 않고 `quick_member` 페이지에서 읽는다 — 운영자 소유 식별자이고, 회원권이
 * 바뀌면 박아둔 값은 에러 없이 틀린다. 계정에 번호가 여럿이면 첫 번째를 쓴다: 2026-10-18
 * 실측에서 두 번호의 지점 목록과 재고 응답이 같았다(`docs/crawlers/kensington.md`).
 *
 * 페이지에 묶인 WeakMap 캐시 — 윈도우마다 다시 읽지 않되, 브라우저와 함께 죽는다.
 */
const cache = new WeakMap<Page, string>();

export async function memberNo(ctx: CrawlerContext): Promise<string> {
  const hit = cache.get(ctx.page);
  if (hit) return hit;

  const res = await ctx.page.request.get(KENSINGTON.memberPageUrl, {
    maxRedirects: 0,
    timeout: KENSINGTON.timeouts.navigation,
  });
  // 익명이면 302 → `/`. 세션이 죽은 것이고 `run.ts`가 패스 안에서 1회 재로그인한다.
  if (res.status() >= 300 && res.status() < 400) {
    throw new SessionLostError(`quick_member ${res.status()} → ${res.headers()["location"] ?? "?"}`);
  }
  if (!res.ok()) throw new Error(`quick_member HTTP ${res.status()}`);

  const html = await res.text();
  const first = [...html.matchAll(KENSINGTON.memberNoPattern)][0];
  if (!first) {
    // 로그인은 살아 있는데 고를 번호가 없다 — 세션 문제가 아니라 계정 문제다. 재로그인해도
    // 같으므로 SessionLostError로 던지지 않는다.
    throw new Error("NO_MEMBERSHIP: 분양회원 예약 페이지에 회원번호가 없다");
  }
  const full = first[2];
  cache.set(ctx.page, full);
  ctx.log("[kensington] membership resolved", {
    count: [...html.matchAll(KENSINGTON.memberNoPattern)].length,
  });
  return full;
}

