import { prisma } from "@/lib/prisma";
import { accrualOn, autoDaysForPeriod, periodByIndex, type LeavePeriod } from "@/lib/leave-accrual";
import { resolveGranted, summarize, withGranted, type BalanceSummary } from "@/lib/leave-balance";
import { toIsoDate } from "@/lib/utils";

/**
 * 회차 요약 읽기 — 사람마다 회차가 다르므로 `year` 같은 공통 인자가 없다.
 *
 * **DB 행이 없어도 자동 계산으로 합성해 돌려준다.** 그래서 (1) 1년 넘은 직원을 방금 등록해도
 * 곧바로 일수가 보이고, (2) 해가 바뀌어도 "아직 부여되지 않았습니다"로 비지 않는다.
 * 잔액 행은 실제로 차감이 일어날 때 `lockPeriodBalance`가 만든다.
 */

export interface PeriodSummary {
  summary: BalanceSummary;
  period: LeavePeriod;
  /** 관리자가 수동 부여로 덮어쓴 회차인지. */
  manual: boolean;
}

interface UserLike {
  id: string;
  hireDate: Date | null;
}

const EMPTY_ROW = { totalDays: null, carriedOverDays: 0, adjustedDays: 0, usedDays: 0 };

/** 한 명의 `onIso` 시점 회차 요약. 입사일이 없으면 null(= 회차를 정의할 수 없다). */
export async function getCurrentBalance(user: UserLike, onIso: string): Promise<PeriodSummary | null> {
  if (!user.hireDate) return null;
  const hireIso = toIsoDate(user.hireDate);
  const { period, autoDays } = accrualOn(hireIso, onIso);
  const row = await prisma.leaveBalance.findUnique({
    where: { userId_periodIndex: { userId: user.id, periodIndex: period.index } },
  });
  return { summary: summarize(withGranted(row ?? EMPTY_ROW, autoDays)), period, manual: row?.totalDays != null };
}

/** 여러 명을 한 번에. 관리자 목록·현황·대시보드용. 입사일 없는 사람은 Map에 들어가지 않는다. */
export async function getCurrentBalanceSummaries(
  users: UserLike[],
  onIso: string,
): Promise<Map<string, PeriodSummary>> {
  const dated = users.filter((u) => u.hireDate);
  if (dated.length === 0) return new Map();

  // 회차 index가 사람마다 달라 복합 where가 길어진다. 1인당 행 수가 한 자릿수라
  // 통째로 읽고 JS에서 맞추는 편이 싸고 읽기 쉽다.
  const rows = await prisma.leaveBalance.findMany({ where: { userId: { in: dated.map((u) => u.id) } } });
  const byUser = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byUser.get(row.userId);
    if (list) list.push(row);
    else byUser.set(row.userId, [row]);
  }

  return new Map(
    dated.map((u) => {
      const hireIso = toIsoDate(u.hireDate!);
      const { period, autoDays } = accrualOn(hireIso, onIso);
      const row = byUser.get(u.id)?.find((r) => r.periodIndex === period.index);
      return [
        u.id,
        { summary: summarize(withGranted(row ?? EMPTY_ROW, autoDays)), period, manual: row?.totalDays != null },
      ] satisfies [string, PeriodSummary];
    }),
  );
}

/**
 * 직원 상세용 — 저장된 회차 행 전부 + 아직 행이 없는 현재 회차.
 * 최신 회차가 위로 오고, 전환 이전의 캘린더 연도 행(음수 index)은 맨 뒤로 간다.
 */
export interface PeriodRow extends PeriodSummary {
  /** 아직 DB 행이 없는 현재 회차는 null. */
  id: string | null;
  /** 수동 부여를 해제했을 때 돌아갈 값. 부여 다이얼로그의 기본값이기도 하다. */
  autoDays: number;
  /** 실효 부여(수동이면 그 값, 아니면 autoDays). 이월·조정은 포함하지 않는다. */
  granted: number;
  carriedOverDays: number;
  adjustedDays: number;
  /** 전환 이전 캘린더 연도 행. 회차 라벨 대신 "{연도}년(이전 기준)"으로 보여준다. */
  legacyYear: number | null;
}

export async function getPeriodRows(user: UserLike, onIso: string): Promise<PeriodRow[]> {
  if (!user.hireDate) return [];
  const hireIso = toIsoDate(user.hireDate);
  const current = accrualOn(hireIso, onIso);
  const rows = await prisma.leaveBalance.findMany({
    where: { userId: user.id },
    orderBy: { periodIndex: "desc" },
  });

  const mapped: PeriodRow[] = rows.map((row) => {
    const legacy = row.periodIndex < 1;
    const period = legacy
      ? { index: row.periodIndex, startIso: toIsoDate(row.periodStart), endIso: toIsoDate(row.periodEnd) }
      : periodByIndex(hireIso, row.periodIndex);
    const autoDays = legacy ? 0 : autoDaysForPeriod(hireIso, period, onIso);
    return {
      id: row.id,
      period,
      autoDays,
      granted: resolveGranted(row, autoDays),
      manual: row.totalDays != null,
      carriedOverDays: row.carriedOverDays,
      adjustedDays: row.adjustedDays,
      legacyYear: legacy ? -row.periodIndex : null,
      summary: summarize(withGranted(row, autoDays)),
    };
  });

  if (!mapped.some((r) => r.period.index === current.period.index)) {
    mapped.unshift({
      id: null,
      period: current.period,
      autoDays: current.autoDays,
      granted: current.autoDays,
      manual: false,
      carriedOverDays: 0,
      adjustedDays: 0,
      legacyYear: null,
      summary: summarize(withGranted(EMPTY_ROW, current.autoDays)),
    });
  }
  return mapped;
}
