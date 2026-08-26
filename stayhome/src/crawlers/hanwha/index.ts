import type { CrawlerContext, CrawlerModule, SearchParams } from "../types";
import { HANWHA } from "./config";
import { checkLoggedIn, performLogin } from "./login";
import { bootSession, performSearch } from "./search";

export const hanwhaCrawler: CrawlerModule = {
  slug: "hanwha",
  // Matches the `Resort.name` seeded for this slug, so the admin screens and
  // the crawl logs read the same way.
  displayName: "한화리조트",
  defaultRegion: "전국",

  /**
   * 두 호스트를 **둘 다** 묻는다.
   *
   * `checkLoggedIn`은 `www`의 `sessionCheck.do`만 본다. 그런데 이 사이트에서
   * 세션을 잃는 쪽은 `booking`이고, 그 상실은 크롤 한복판(`bootSession`)에서야
   * `SessionLostError`로 드러난다 — 2026-08-26 09:06:46이 그 자리였고, 그
   * 패스는 통째로 버려진 뒤 재시도 두 번이 마른 `/tmp`에서 죽어 함수 최종
   * 실패가 됐다. 여기서 미리 물으면 같은 사건이 "검증 false → 로그인 → 검색"
   * 으로 **한 패스 안에 흡수**된다.
   *
   * 절대 throw하지 않는다: `run.ts`가 이 호출을 deadline으로 감싸므로 새어 나간
   * 예외는 로그인 시도조차 없이 패스를 죽인다. 타임아웃을 기본 25초가 아니라
   * 짧게 주는 이유는 예약 호스트가 넷퍼넬 대기열에 걸리면 증상이 에러가 아니라
   * **응답 없음**이어서, 검증 하나가 패스 예산을 갉아먹을 수 있기 때문이다.
   */
  async validateSession(ctx: CrawlerContext) {
    if (!(await checkLoggedIn(ctx))) return false;
    try {
      await bootSession(ctx, HANWHA.timeouts.validateBoot);
      return true;
    } catch (e) {
      ctx.log("[hanwha] booking host not ready at validation", {
        error: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  },

  login(ctx: CrawlerContext) {
    return performLogin(ctx);
  },

  searchAvailability(ctx: CrawlerContext, params: SearchParams) {
    return performSearch(ctx, params);
  },
};

export { HANWHA };
