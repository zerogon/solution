/**
 * Welfare Stay 브랜드 마크의 기하 정의 — "지붕 + 물결"(머무는 곳 + 리조트).
 *
 * 앱 안의 인라인 SVG(`components/app-mark.tsx`)와 PWA 아이콘 PNG를 굽는
 * `scripts/generate-icons.ts`가 **같은 상수를 공유**한다. 한쪽만 고쳐서 사이드바
 * 로고와 홈 화면 아이콘이 서로 다른 그림이 되는 일을 막기 위한 것이다.
 *
 * 좌표계는 64×64. 글리프는 x 13~51, y 15~52 범위에 들어간다.
 */

/**
 * 마크 배경. `--primary: oklch(0.52 0.1 205)`(= #007984)를 기준으로 한 톤 밝게 잡았다.
 *
 * 그라디언트 대신 단색 + 하이라이트 도형을 쓴다. 그라디언트는 `<defs>`에 id가
 * 필요한데, 이 마크는 서버 컴포넌트에서도 렌더되므로 `useId`를 쓸 수 없고
 * 고정 id는 한 페이지에 마크가 둘 이상일 때 중복된다.
 */
export const MARK_BG = "#0A8E9B";
/** 좌상단 대각 하이라이트 — 단색 배경에 약간의 입체감만 준다. */
export const MARK_HIGHLIGHT = "M0 0 H64 L0 64 Z";

/** 지붕 — 열린 삼각형. */
export const MARK_ROOF = "M13 30 L32 15 L51 30";
/** 벽체 — 아래가 열린 사각형. */
export const MARK_BODY = "M19 30 v13 h26 v-13";
/** 물결 — 아래를 가로지르는 S 곡선. */
export const MARK_WAVE = "M14 50 q4.5 -5 9 0 t9 0 t9 0 t9 0";

export const MARK_VIEWBOX = "0 0 64 64";
