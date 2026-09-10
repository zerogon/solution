/**
 * 연차 잔여 산식 — PRD 4.3.
 *
 *   총 보유 = totalDays + carriedOverDays + adjustedDays
 *   잔여    = 총 보유 - usedDays
 *
 * `LeaveBalance.totalDays`는 **nullable이고 null이 "자동 계산"을 뜻한다**(2026-09-10).
 * 그래서 DB 행을 `summarize`에 바로 넣을 수 없다 — 반드시 `withGranted(row, autoDays)`를
 * 먼저 통과시킨다. `BalanceLike.totalDays`를 `number`로 남겨 둔 것이 그 강제 장치다.
 *
 * 승인 절차가 없으므로(2026-09-05) 신청이 곧 차감이다. `usedDays`는 DB 컬럼 하나로 끝나고
 * 대기분 집계는 없다. 모든 값은 0.5 단위라 이진 부동소수로 정확하지만, 합산 순서에 따른
 * 표기 잡음을 막기 위해 `roundHalf`를 한 번 거친다.
 */

export interface BalanceLike {
  totalDays: number;
  carriedOverDays: number;
  adjustedDays: number;
  usedDays: number;
}

export interface BalanceSummary {
  total: number;
  used: number;
  remaining: number;
}

/** 0.5 단위로 반올림. 0.1+0.2 류의 잡음 제거용이지 반올림 정책이 아니다. */
export function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

export function summarize(b: BalanceLike): BalanceSummary {
  const total = roundHalf(b.totalDays + b.carriedOverDays + b.adjustedDays);
  const used = roundHalf(b.usedDays);
  const remaining = roundHalf(total - used);
  return { total, used, remaining };
}

export const EMPTY_SUMMARY: BalanceSummary = { total: 0, used: 0, remaining: 0 };

/** 실효 부여 일수 — 수동 override가 있으면 그 값, 없으면 자동 계산값. */
export function resolveGranted(row: { totalDays: number | null }, autoDays: number): number {
  return row.totalDays ?? autoDays;
}

/**
 * 실효 부여를 채운 사본. 모든 읽기·쓰기가 이 깔때기를 통과해야 자동 회차의 값이 새어나가지 않는다.
 *
 * 자동값을 DB에 저장하지 않는 이유: 1년 미만 회차는 매달 커지므로 저장하는 순간 낡는다.
 */
export function withGranted<T extends { totalDays: number | null }>(
  row: T,
  autoDays: number,
): Omit<T, "totalDays"> & { totalDays: number } {
  return { ...row, totalDays: resolveGranted(row, autoDays) };
}
