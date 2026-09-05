/**
 * 연차 잔여 산식 — PRD 4.2.
 *
 *   총 보유 = totalDays + carriedOverDays + adjustedDays
 *   잔여    = 총 보유 - usedDays
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
