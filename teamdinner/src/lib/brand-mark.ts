/**
 * teamdinner 브랜드 마크 — "그릇 + 젓가락".
 *
 * 앱 안의 인라인 SVG(`components/app-mark.tsx`)와 PWA 아이콘 PNG를 굽는
 * `scripts/generate-icons.ts`가 같은 상수를 공유한다 (stayhome과 같은 구조).
 * 좌표계는 64×64.
 */

/** 마크 배경. `--primary: oklch(0.6 0.17 45)` 계열의 웜 오렌지. */
export const MARK_BG = "#E0702A";
/** 좌상단 대각 하이라이트. */
export const MARK_HIGHLIGHT = "M0 0 H64 L0 64 Z";

/** 그릇 — 아래로 둥근 반원. */
export const MARK_BOWL = "M13 33 H51 A19 19 0 0 1 13 33 Z";
/** 그릇 받침. */
export const MARK_FOOT = "M24 52 H40";
/** 젓가락 두 개 — 그릇 위에서 오른쪽 아래로 교차. */
export const MARK_STICK_A = "M20 11 L44 31";
export const MARK_STICK_B = "M29 8 L48 27";

export const MARK_VIEWBOX = "0 0 64 64";
