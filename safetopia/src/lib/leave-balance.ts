/**
 * 연도별 잔여 산식 — 엑셀의 "부여 / 이월 / 사용 / 잔여" 네 칸.
 *
 *   총 보유 = grantedDays + carriedOverDays
 *   잔여    = 총 보유 - used
 *
 * `used`는 저장된 누계가 아니라 그 해 `LeaveEntry.days`의 합이다(`queries.ts`). 기록을 고치거나
 * 지우면 곧바로 맞는 값이 나온다. 모든 값은 0.5 단위라 이진 부동소수로 정확하지만, 합산 순서에
 * 따른 표기 잡음을 막기 위해 `roundHalf`를 한 번 거친다.
 *
 * 잔여가 음수여도 막지 않는다 — 장부는 일어난 일을 적는 곳이다. 화면이 빨갛게 보여 줄 뿐이다.
 */

export interface YearBalanceInput {
  grantedDays: number;
  carriedOverDays: number;
  used: number;
}

export interface BalanceSummary {
  granted: number;
  carriedOver: number;
  total: number;
  used: number;
  remaining: number;
}

/** 0.5 단위로 반올림. 0.1+0.2 류의 잡음 제거용이지 반올림 정책이 아니다. */
export function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

export function summarize(b: YearBalanceInput): BalanceSummary {
  const total = roundHalf(b.grantedDays + b.carriedOverDays);
  const used = roundHalf(b.used);
  return {
    granted: roundHalf(b.grantedDays),
    carriedOver: roundHalf(b.carriedOverDays),
    total,
    used,
    remaining: roundHalf(total - used),
  };
}
