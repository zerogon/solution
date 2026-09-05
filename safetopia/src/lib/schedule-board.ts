/**
 * 관리자 대시보드의 직원×날짜 스케줄 보드 — 순수 계산부.
 *
 * DB 행(직원 + 잔여 요약, 확정 휴가 일자)을 지점별 그룹으로 접고, 날짜별 휴가 인원을
 * 가중치(연차 1, 반차 0.5)로 합산한다. 렌더링은 `LeaveScheduleBoard`가 맡는다.
 * 날짜는 전부 "YYYY-MM-DD" 문자열 — 호출자가 `toIsoDate`로 바꿔서 넘긴다.
 */
import { LeaveType } from "@/generated/prisma/enums";
import type { BalanceSummary } from "@/lib/leave-balance";
import { roundHalf } from "@/lib/leave-balance";
import { addDaysIso } from "@/lib/utils";

/** 인원 집계 가중치. `LeaveRequestDay.type`이 이걸 위해 비정규화돼 있다. */
export const OFF_WEIGHT: Record<LeaveType, number> = {
  [LeaveType.FULL_DAY]: 1,
  [LeaveType.AM_HALF]: 0.5,
  [LeaveType.PM_HALF]: 0.5,
};

export interface BoardBranch {
  id: string;
  name: string;
  closedWeekdays: number[];
}

export interface BoardUserInput {
  id: string;
  name: string;
  branch: BoardBranch | null;
  summary: BalanceSummary | null;
}

export interface BoardDayRow {
  userId: string;
  date: string;
  type: LeaveType;
}

export interface BoardMember {
  id: string;
  name: string;
  summary: BalanceSummary | null;
  cells: Record<string, LeaveType>;
}

export interface BoardGroup {
  /** null = 소속 없음. 항상 맨 뒤. */
  branch: BoardBranch | null;
  members: BoardMember[];
  /** 날짜별 휴가 인원(가중). 0인 날은 키가 없다. */
  offByDay: Record<string, number>;
}

/** `startIso`부터 `count`일. `rangeDays("2026-09-05", 3)` → 9/5, 9/6, 9/7. */
export function rangeDays(startIso: string, count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(addDaysIso(startIso, i));
  return out;
}

export function buildScheduleBoard(input: { users: BoardUserInput[]; dayRows: BoardDayRow[]; days: string[] }): BoardGroup[] {
  const inRange = new Set(input.days);

  const cellsByUser = new Map<string, Record<string, LeaveType>>();
  for (const row of input.dayRows) {
    if (!inRange.has(row.date)) continue;
    if (!cellsByUser.has(row.userId)) cellsByUser.set(row.userId, {});
    cellsByUser.get(row.userId)![row.date] = row.type;
  }

  const groups = new Map<string | null, BoardGroup>();
  for (const u of input.users) {
    const key = u.branch?.id ?? null;
    if (!groups.has(key)) groups.set(key, { branch: u.branch, members: [], offByDay: {} });
    const g = groups.get(key)!;
    const cells = cellsByUser.get(u.id) ?? {};
    g.members.push({ id: u.id, name: u.name, summary: u.summary, cells });
    for (const [date, type] of Object.entries(cells)) {
      g.offByDay[date] = roundHalf((g.offByDay[date] ?? 0) + OFF_WEIGHT[type]);
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (!a.branch) return 1;
    if (!b.branch) return -1;
    return a.branch.name.localeCompare(b.branch.name, "ko");
  });
}
