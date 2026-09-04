import type { SearchParams } from "../types";

/**
 * 이 패스에서 실제로 돌 지점을 고른다 — 다섯 크롤러가 각자 갖고 있던 동일한
 * 프롤로그를 한 자리로 모은 것.
 *
 * 두 축이 있고 순서가 중요하다:
 *
 * 1. **`excludeBranches`** — 운영자가 `/admin/properties`에서 뺀 지점. `run.ts`가
 *    `ResortBranchExclusion`에서 읽어 모든 윈도우에 같은 값으로 넣는다.
 * 2. **`branch`** — 사용자가 최신화로 지목한 단일 지점.
 *
 * 제외를 먼저 적용하므로 **제외된 지점을 지목한 최신화는 빈 배열**이 된다. 그게 맞다:
 * 조회 화면은 그 지점을 그리지 않지만 서비스워커에 캐시된 옛 URL이나 손으로 만든
 * 요청은 여기 도달할 수 있고, 제외는 언제나 이긴다.
 *
 * **허용 목록이 아니라 제외 목록인 이유 둘.** ① `run.ts`는 크롤러 config를 모른다
 * (`loadCrawler`가 lazy이고, 그래야 `bizCd`·`brchCd` 같은 크롤 전용 코드가 공용
 * 모듈로 새지 않는다) — 뺄 대상은 이름만으로 지목되지만 허용 목록은 전체 배열을
 * 알아야 만들 수 있다. ② 여기 있는 이름이 `config.branches`와 어긋나면 **아무것도
 * 걸러내지 않는 무동작**이다. 허용 목록에서 같은 어긋남은 "그 지점만 조용히 안 돎"
 * 이고, 그건 `resort-catalog.ts`가 지점 메타의 DB 사본을 거부한 바로 그 증상이다.
 *
 * 빈 배열을 돌려줄 수 있다. 호출자는 그것을 로그와 함께 조기 반환으로 처리해야 한다 —
 * **이유를 말하지 않는 0행 윈도우는 "전 객실 매진"과 구별되지 않는다.**
 */
export function selectBranches<B extends { value: string }>(
  all: readonly B[],
  params: Pick<SearchParams, "branch" | "excludeBranches">,
): B[] {
  const excluded = params.excludeBranches;
  const kept =
    excluded && excluded.length > 0
      ? all.filter((b) => !excluded.includes(b.value))
      : all.slice();

  return params.branch ? kept.filter((b) => b.value === params.branch) : kept;
}
