/**
 * 위젯과 지연 로드되는 본문이 함께 쓰는 상수.
 *
 * 별도 파일인 이유는 하나뿐이다 — 부모가 `DeadlineCalculatorBody`에서 이 값을
 * import하면 `next/dynamic`이 잘라내려던 청크가 정적 의존으로 되살아나
 * `react-day-picker`가 다시 셸로 딸려 온다.
 */

/**
 * 마감 리드타임. **기준일에서 달력일 10일을 뺀다**(기준일 비포함, 기준일의 휴일 여부 무관).
 *
 * "영업일 10일"이 아니다 — 규칙과 그 경계 사례는 `@/lib/business-days`의 헤더에 있다.
 */
export const LEAD_DAYS = 10;
