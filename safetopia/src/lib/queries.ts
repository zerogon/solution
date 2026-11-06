import { prisma } from "@/lib/prisma";
import { summarize, type BalanceSummary } from "@/lib/leave-balance";
import {
  PRE_HIRE_INDEX,
  autoDaysForPeriod,
  periodByIndex,
  periodFor,
  periodIndexFor,
  type LeavePeriod,
} from "@/lib/leave-accrual";
import { toIsoDate } from "@/lib/utils";

/**
 * 장부 읽기. 회차는 입사일 기준(`leave-accrual.ts`)이고 한 기록은 한 회차 안에 있다(`leave-days.ts`
 * `period_boundary`) — 그래서 "그 회차의 기록" = 시작일이 그 회차에 있는 기록이다(`periodIndexFor`).
 * 입사일 이전 기록은 index 0("입사 전")으로 따로 모은다.
 */

export interface PeriodSummary {
  /** 1-based 회차. 0 = 입사 전. */
  index: number;
  /** index 0이면 null. */
  period: LeavePeriod | null;
  /** 입사일로 계산한 발생 일수(오늘 기준, 지난 회차는 끝난 시점 기준, 미래 회차는 시작 시점 기준). */
  autoDays: number;
  /** 아직 시작하지 않은 회차. 발생은 "예정"이다. */
  upcoming: boolean;
  summary: BalanceSummary;
  memo: string | null;
  /** 조정 행(이월·보정·메모)이 있는지. */
  hasRow: boolean;
}

/**
 * 1회차부터 (오늘 회차 · 조정이 있는 회차 · 기록이 있는 회차 · `ensureIndexes`) 중 가장 큰 회차까지, 최신순.
 * 입사 전 기록이 있으면 맨 끝에 index 0. 캘린더 요약과 설정의 회차 표가 쓴다.
 */
export async function getPeriodSummaries(
  hireIso: string,
  todayIso: string,
  ensureIndexes: number[] = [],
): Promise<PeriodSummary[]> {
  const [rows, entries] = await Promise.all([
    prisma.leavePeriod.findMany(),
    prisma.leaveEntry.findMany({ select: { startDate: true, days: true } }),
  ]);
  const usedByIndex = new Map<number, number>();
  for (const e of entries) {
    const i = periodIndexFor(hireIso, toIsoDate(e.startDate));
    usedByIndex.set(i, (usedByIndex.get(i) ?? 0) + e.days);
  }
  const maxIndex = Math.max(
    periodFor(hireIso, todayIso).index,
    ...rows.map((r) => r.index),
    ...usedByIndex.keys(),
    ...ensureIndexes,
  );
  const indexes: number[] = [];
  for (let i = maxIndex; i >= 1; i--) indexes.push(i);
  if (usedByIndex.has(PRE_HIRE_INDEX)) indexes.push(PRE_HIRE_INDEX);

  return indexes.map((index) => {
    const row = rows.find((r) => r.index === index);
    const period = index === PRE_HIRE_INDEX ? null : periodByIndex(hireIso, index);
    const upcoming = period != null && period.startIso > todayIso;
    // 미래 회차는 시작일 기준으로 센다 — 다음 해 휴가를 미리 적어도 잔여가 음수로 보이지 않게.
    const autoDays = period ? autoDaysForPeriod(hireIso, period, upcoming ? period.startIso : todayIso) : 0;
    return {
      index,
      period,
      autoDays,
      upcoming,
      summary: summarize({
        grantedDays: autoDays,
        carriedOverDays: row?.carriedOverDays ?? 0,
        adjustedDays: row?.adjustedDays ?? 0,
        used: usedByIndex.get(index) ?? 0,
      }),
      memo: row?.memo ?? null,
      hasRow: Boolean(row),
    };
  });
}

/** `Owner.hireDate`(@db.Date, UTC 자정) → "YYYY-MM-DD" | null. 페이지·클라이언트는 Date를 쥐지 않는다. */
export function hireIsoOf(hireDate: Date | null): string | null {
  return hireDate ? toIsoDate(hireDate) : null;
}

export async function getOwner() {
  const owner = await prisma.owner.findUnique({
    where: { id: "owner" },
    select: { name: true, closedWeekdays: true, hireDate: true },
  });
  if (!owner) throw new Error("Owner 행이 없습니다. `npm run owner:set-password`로 먼저 만드세요.");
  return { name: owner.name, closedWeekdays: owner.closedWeekdays, hireIso: hireIsoOf(owner.hireDate) };
}
