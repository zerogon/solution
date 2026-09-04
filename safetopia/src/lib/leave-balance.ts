/**
 * 연차 잔여 산식 — PRD 4.2.
 *
 *   총 보유   = totalDays + carriedOverDays + adjustedDays
 *   실제 잔여 = 총 보유 - usedDays(승인 완료)
 *   신청 가능 = 실제 잔여 - pendingDays(승인 대기)
 *
 * `usedDays`는 DB 컬럼, `pendingDays`는 PENDING 신청의 `days` 합으로 집계한다.
 * 모든 값은 0.5 단위라 이진 부동소수로 정확하지만, 합산 순서에 따른 표기 잡음을
 * 막기 위해 `roundHalf`를 한 번 거친다.
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
  pending: number;
  remaining: number;
  available: number;
}

/** 0.5 단위로 반올림. 0.1+0.2 류의 잡음 제거용이지 반올림 정책이 아니다. */
export function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

export function summarize(b: BalanceLike, pendingSum: number): BalanceSummary {
  const total = roundHalf(b.totalDays + b.carriedOverDays + b.adjustedDays);
  const used = roundHalf(b.usedDays);
  const pending = roundHalf(pendingSum);
  const remaining = roundHalf(total - used);
  const available = roundHalf(remaining - pending);
  return { total, used, pending, remaining, available };
}

export const EMPTY_SUMMARY: BalanceSummary = { total: 0, used: 0, pending: 0, remaining: 0, available: 0 };
