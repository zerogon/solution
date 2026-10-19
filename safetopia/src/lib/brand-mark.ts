/**
 * 브랜드 마크의 정의 — 원 안의 턱시도 고양이(2026-10-19 교체).
 *
 * 로고는 손으로 그린 벡터가 아니라 **사람이 넣은 원본 래스터**(`assets/brand/logo.png`,
 * 1254×1254, 배경 투명, 원형 테두리까지 그림에 들어 있다)다. 앱 안의 마크
 * (`components/app-mark.tsx`)와 PWA 아이콘 PNG를 굽는 `scripts/generate-icons.ts`가
 * **이 모듈의 상수를 공유**한다.
 *
 * 그림이 스스로 원형 테두리를 갖고 있어 예전처럼 배경 사각형을 깔거나 엠블럼을 잘라내지 않는다.
 * 배경은 투명이 안 되는 자리(maskable·iOS 아이콘)에서만 깐다.
 *
 * 원본을 `public/` 밖에 두는 이유: 1.5MB라 공개 URL로 서비스할 물건이 아니다.
 * 로고를 교체하려면 `public/icons/README.md`의 절차를 따른다.
 */

/** 원본 로고. 앱 패키지 루트 기준 상대 경로. */
export const LOGO_SOURCE = "assets/brand/logo.png";

/**
 * 투명이 허용되지 않는 아이콘의 배경 — `manifest.json`의 `background_color`, `--background` 토큰과 같은 값.
 * sharp(Node)가 쓰므로 CSS 변수가 아니라 hex 리터럴이다.
 */
export const ICON_BG = "#FDFBF9";

/** 생성물 경로. 앱은 이 경로만 참조한다(`scripts/generate-icons.ts`가 만든다). */
export const MARK_SRC = "/icons/mark.png";
/** 생성물의 정사각 변 길이(px). `<Image>`의 width/height에 그대로 쓴다. */
export const MARK_PX = 256;
