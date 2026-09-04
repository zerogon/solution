import type { PrismaClient } from "@/generated/prisma/client";
import { EmployeeStatus, LeaveStatus, LeaveType, Role } from "@/generated/prisma/enums";
import { parseDate, toIsoDate } from "@/lib/utils";

export interface DayHeadcount {
  date: string;
  /** 지점 재직 직원 수. */
  staff: number;
  /** 승인된 휴가 인원(반차 0.5). */
  approvedOff: number;
  /** 대기 중 휴가 인원(반차 0.5). */
  pendingOff: number;
  /** staff - approvedOff - pendingOff. 대기가 전부 승인된다면의 근무 인원. */
  expectedWorking: number;
}

const weight = (t: LeaveType) => (t === LeaveType.FULL_DAY ? 1 : 0.5);

/**
 * 지점의 날짜별 근무 예정 인원. 승인 화면이 "이 날 이 지점에 몇 명 남나"를 묻는 데 쓴다.
 * `LeaveRequestDay`는 PENDING/APPROVED만 갖고 있으므로 상태만 나누면 된다.
 */
export async function branchHeadcount(
  db: PrismaClient,
  branchId: string,
  dates: string[],
): Promise<DayHeadcount[]> {
  if (dates.length === 0) return [];
  const [staff, rows] = await Promise.all([
    db.user.count({ where: { branchId, role: Role.EMPLOYEE, status: EmployeeStatus.ACTIVE } }),
    db.leaveRequestDay.findMany({
      where: { date: { in: dates.map(parseDate) }, user: { branchId } },
      select: { date: true, type: true, leaveRequest: { select: { status: true } } },
    }),
  ]);

  const byDate = new Map<string, { approved: number; pending: number }>();
  for (const iso of dates) byDate.set(iso, { approved: 0, pending: 0 });
  for (const r of rows) {
    const bucket = byDate.get(toIsoDate(r.date));
    if (!bucket) continue;
    if (r.leaveRequest.status === LeaveStatus.APPROVED) bucket.approved += weight(r.type);
    else if (r.leaveRequest.status === LeaveStatus.PENDING) bucket.pending += weight(r.type);
  }

  return dates.map((date) => {
    const { approved, pending } = byDate.get(date)!;
    return {
      date,
      staff,
      approvedOff: approved,
      pendingOff: pending,
      expectedWorking: staff - approved - pending,
    };
  });
}

/** 여러 날짜 중 가장 인원이 적은 날 — 승인 카드에 한 줄로 요약할 때. */
export function worstDay(rows: DayHeadcount[]): DayHeadcount | null {
  if (rows.length === 0) return null;
  return rows.reduce((min, r) => (r.expectedWorking < min.expectedWorking ? r : min), rows[0]);
}
