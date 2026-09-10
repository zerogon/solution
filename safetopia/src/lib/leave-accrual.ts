import { addDaysIso, addMonthsIso, formatKoDate } from "@/lib/utils";

/**
 * 입사일 기준 연차 회차·자동 발생 — 순수 함수. 서버(부여·신청)와 클라이언트(미리보기)가 같은 코드를 돈다.
 *
 * ## 회차(period)
 * n회차 = `[addMonthsIso(hire, 12*(n-1)), 다음 회차 시작 - 1일]`. 1-based, 1회차가 입사 첫 해다.
 * **항상 입사일을 앵커로 계산한다** — 이전 회차에서 체이닝하면 말일 클램프가 누적돼 드리프트한다
 * (1/31 입사를 체이닝하면 2/28 → 3/28로 밀리지만, 앵커 방식은 3/31로 돌아온다).
 * 불변식: `end(n) + 1일 === start(n+1)`. 빈틈도 겹침도 없다.
 *
 * ## 말일·윤년
 * `addMonthsIso`가 목표 월 말일로 클램프한다. 2/29 입사 → 평년 기념일 2/28, 윤년에는 다시 2/29.
 * 그래서 회차 길이가 364~366일로 흔들리지만 경계는 항상 맞물린다.
 *
 * ## 발생 규칙 (근로기준법 60조)
 * - **1회차(1년 미만)**: 입사 후 1·2·…·11개월 시점마다 1일, 최대 11일. 진행형이라 기준일에 따라 커진다.
 *   회차가 끝나면(입사 1주년) 미사용분은 소멸 — 자동 이월은 없다(`carriedOverDays`는 관리자 수동 입력).
 * - **2회차 이상**: 회차 시작 시점의 만 근속연수 `y = index - 1`에 대해 `min(25, 15 + floor((y-1)/2))`.
 *   만1·2년 15, 만3·4년 16, 만5·6년 17 … 만21년 이상 25. 회차 중에는 변하지 않는다.
 *
 * 법정 요건인 "1개월 개근"·"연 80% 출근"은 이 앱이 출근을 관리하지 않으므로 **충족을 가정**한다.
 * 예외는 관리자 조정(`adjustedDays`)으로 처리한다.
 */

export interface LeavePeriod {
  /** 1-based 회차. 1 = 입사 첫 해(1년 미만). */
  index: number;
  startIso: string;
  endIso: string;
}

/** 1년 미만 월차 상한. 12번째 달은 1주년이라 연차(15일)가 대신 발생한다. */
export const MAX_MONTHLY_DAYS = 11;
/** 만 1년차 기본 연차. */
export const BASE_ANNUAL_DAYS = 15;
/** 가산 포함 상한(만 21년차 이상). */
export const MAX_ANNUAL_DAYS = 25;

/** n회차. `index < 1`은 1로 클램프한다. */
export function periodByIndex(hireIso: string, index: number): LeavePeriod {
  const n = Math.max(1, Math.trunc(index));
  return {
    index: n,
    startIso: addMonthsIso(hireIso, 12 * (n - 1)),
    endIso: addDaysIso(addMonthsIso(hireIso, 12 * n), -1),
  };
}

/** `onIso`가 속한 회차. 입사 이전 날짜를 물으면 1회차를 돌려준다(방어). */
export function periodFor(hireIso: string, onIso: string): LeavePeriod {
  // 회차 간격이 정확히 1년이라 연도 차이가 곧 회차 차이다. 보정은 최대 한 번.
  let idx = Number(onIso.slice(0, 4)) - Number(hireIso.slice(0, 4)) + 1;
  if (idx < 1) idx = 1;
  while (idx > 1 && periodByIndex(hireIso, idx).startIso > onIso) idx--;
  while (periodByIndex(hireIso, idx + 1).startIso <= onIso) idx++;
  return periodByIndex(hireIso, idx);
}

/** 1년 미만 월차 누적 — `k=1..11` 중 기념일이 `onIso` 이하인 개수. 0~11. */
export function monthlyAccruedDays(hireIso: string, onIso: string): number {
  let days = 0;
  for (let k = 1; k <= MAX_MONTHLY_DAYS; k++) {
    if (addMonthsIso(hireIso, k) <= onIso) days++;
  }
  return days;
}

/** 만 `years`년차의 연 발생 일수. 1년 미만(`years < 1`)은 여기서 세지 않는다. */
export function annualDaysForYears(years: number): number {
  if (years < 1) return 0;
  return Math.min(MAX_ANNUAL_DAYS, BASE_ANNUAL_DAYS + Math.floor((years - 1) / 2));
}

/**
 * 회차의 자동 발생 일수.
 *
 * - `onIso`가 회차 **이전**이면 0 — 아직 시작하지 않은 회차의 연차를 미리 쓸 수는 없다.
 * - `onIso`가 회차를 **넘어가면** `endIso`로 고정한다. 끝난 1회차는 11일에서 멈춘다.
 */
export function autoDaysForPeriod(hireIso: string, period: LeavePeriod, onIso: string): number {
  if (onIso < period.startIso) return 0;
  const asOf = onIso > period.endIso ? period.endIso : onIso;
  return period.index === 1
    ? monthlyAccruedDays(hireIso, asOf)
    : annualDaysForYears(period.index - 1);
}

/** 편의 래퍼 — 입사일 + 기준일 → 그 시점의 회차와 발생 일수. */
export function accrualOn(hireIso: string, onIso: string): { period: LeavePeriod; autoDays: number } {
  const period = periodFor(hireIso, onIso);
  return { period, autoDays: autoDaysForPeriod(hireIso, period, onIso) };
}

/** 다음 발생 시점과 그때 늘어나는 일수. 1회차 중이면 다음 월 기념일(+1일), 아니면 다음 회차 시작. */
export function nextAccrualIso(hireIso: string, onIso: string): { iso: string; days: number } {
  const period = periodFor(hireIso, onIso);
  if (period.index === 1) {
    const accrued = monthlyAccruedDays(hireIso, onIso);
    if (accrued < MAX_MONTHLY_DAYS) {
      return { iso: addMonthsIso(hireIso, accrued + 1), days: 1 };
    }
  }
  const next = periodByIndex(hireIso, period.index + 1);
  return { iso: next.startIso, days: annualDaysForYears(next.index - 1) };
}

/** "4년차 · 2026.03.02~2027.03.01". 1회차만 1년 미만이라 따로 표시한다. */
export function formatPeriodLabel(period: LeavePeriod): string {
  const range = `${formatKoDate(period.startIso)}~${formatKoDate(period.endIso)}`;
  return period.index === 1 ? `1년차(1년 미만) · ${range}` : `${period.index}년차 · ${range}`;
}
