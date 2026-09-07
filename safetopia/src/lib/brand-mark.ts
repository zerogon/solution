/**
 * safetopia 브랜드 마크의 정의 — 로스팅 팬 + 원두 + 불꽃("ROASTING CAFÉ").
 *
 * 로고는 손으로 그린 벡터가 아니라 **사람이 넣은 원본 래스터**(`public/icons/icon.png`,
 * 1254×1254, 배경 투명)다. 앱 안의 마크(`components/app-mark.tsx`)와 PWA 아이콘 PNG를
 * 굽는 `scripts/generate-icons.ts`가 **이 모듈의 상수를 공유**한다 — 한쪽만 고쳐서
 * 사이드바 로고와 홈 화면 아이콘이 서로 다른 그림·다른 모서리가 되는 일을 막는다.
 *
 * 로고를 교체하려면 `public/icons/README.md`의 절차를 따른다.
 */

/**
 * 원본 로고. 저장소 루트가 아니라 **safetopia 패키지 루트** 기준 상대 경로다.
 * 아래 crop 좌표는 전부 이 1254×1254 이미지의 픽셀 좌표계다.
 */
export const LOGO_SOURCE = "public/icons/icon.png";

/**
 * 마크 배경 — 크림. `--background`(oklch 0.99 0.004 75)보다 한 톤 낮은 아이보리라
 * 흰 카드 위에서도 마크의 사각형이 또렷하게 떨어진다.
 *
 * CSS 변수가 아니라 hex 리터럴인 이유: 이 값을 sharp(Node)가 쓰는데 거기엔 CSS 변수가
 * 없다. 대신 앱 쪽도 이 상수를 import 해서 두 곳이 갈라지지 않게 한다.
 */
export const MARK_BG = "#F1EAE1"; // oklch(0.94 0.014 72)
/** 로고 잉크 — 원본 이미지에서 측정한 평균 브라운. `--primary`(oklch 0.42 0.07 52)의 근거값. */
export const MARK_INK = "#503322"; // oklch(0.35 0.05 50)

/**
 * 라운드 사각형 모서리 비율(변 길이 대비). 인라인 렌더와 구운 PNG가 이 값 하나를 쓴다.
 * 예전엔 컴포넌트가 25%(`rx=16`), 생성기가 21.9%(`cornerRadius: 14`)로 갈라져 있었다.
 */
export const MARK_CORNER_RATIO = 0.22;

/** 엠블럼(팬 + 원두 + 불꽃)만 잘라내는 정사각 영역. 잉크 bbox x456~845 / y305~705 중심 + 여백. */
export const EMBLEM_CROP = { left: 425, top: 280, width: 450, height: 450 };
/**
 * 워드마크까지 포함한 전체 로고 락업. 잉크 bbox x312~942 / y305~937 중심 + 여백.
 * 정사각으로 잡아 산출물이 정확히 512×512가 되게 한다 — `<Image>`에 넘길
 * intrinsic 크기가 반올림에 흔들리면 안 되기 때문이다.
 */
export const LOCKUP_CROP = { left: 285, top: 279, width: 684, height: 684 };

/** 생성물 경로. 앱은 이 경로만 참조한다(`scripts/generate-icons.ts`가 만든다). */
export const MARK_SRC = "/icons/mark.png";
export const LOCKUP_SRC = "/icons/logo-lockup.png";
/** 생성물의 정사각 변 길이(px). `<Image>`의 width/height에 그대로 쓴다. */
export const MARK_PX = 256;
export const LOCKUP_PX = 512;
