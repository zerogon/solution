/**
 * safetopia 브랜드 마크의 기하 정의 — "컵 + 잎"(카페 + 휴식).
 *
 * 앱 안의 인라인 SVG(`components/app-mark.tsx`)와 PWA 아이콘 PNG를 굽는
 * `scripts/generate-icons.ts`가 **같은 상수를 공유**한다. 한쪽만 고쳐서 사이드바
 * 로고와 홈 화면 아이콘이 서로 다른 그림이 되는 일을 막기 위한 것이다.
 *
 * 좌표계는 64×64. 글리프는 x 14~52, y 12~52 범위에 들어간다.
 */

/**
 * 마크 배경. `--primary: oklch(0.52 0.11 150)`를 기준으로 한 톤 밝게 잡았다.
 *
 * 그라디언트 대신 단색 + 하이라이트 도형을 쓴다. 그라디언트는 `<defs>`에 id가
 * 필요한데, 이 마크는 서버 컴포넌트에서도 렌더되므로 `useId`를 쓸 수 없고
 * 고정 id는 한 페이지에 마크가 둘 이상일 때 중복된다.
 */
export const MARK_BG = "#3F8F5E";
/** 좌상단 대각 하이라이트 — 단색 배경에 약간의 입체감만 준다. */
export const MARK_HIGHLIGHT = "M0 0 H64 L0 64 Z";

/** 컵 본체 — 위가 열린 U자. */
export const MARK_CUP = "M17 27 h26 v11 a13 13 0 0 1 -26 0 z";
/** 손잡이 — 오른쪽 반원. */
export const MARK_HANDLE = "M43 30 h4 a5 5 0 0 1 0 10 h-4";
/** 잎 — 컵 위로 솟은 새싹(휴식). */
export const MARK_LEAF = "M30 27 c0 -8 4 -12 12 -13 c-1 8 -5 12 -12 13 z";
/** 잎맥. */
export const MARK_LEAF_VEIN = "M30 27 c4 -4 7 -7 10 -10";

export const MARK_VIEWBOX = "0 0 64 64";
