/**
 * 위젯과 지연 로드되는 팝업 본문이 함께 쓰는 상수.
 *
 * 별도 파일인 이유는 하나뿐이다 — 부모가 `DeadlineCalculatorBody`에서 이 값을
 * import하면 `next/dynamic`이 잘라내려던 청크가 정적 의존으로 되살아나
 * `react-day-picker`가 다시 셸로 딸려 온다.
 */

/** 마감 리드타임. "영업일 기준 10일 전". */
export const LEAD_BUSINESS_DAYS = 10;
