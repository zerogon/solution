import { prisma } from "@/lib/prisma";
import { branchHeadcount, worstDay } from "@/lib/headcount";
import { addDaysIso, toIsoDate } from "@/lib/utils";
import { LeaveStatus } from "@/generated/prisma/enums";
import type { PendingRequestView } from "@/components/admin/PendingRequestCard";

/** 승인 대기 목록 + 각 건의 지점 근무 예정 인원(가장 적은 날). 대시보드·연차 관리가 공유. */
export async function getPendingRequests(limit?: number): Promise<PendingRequestView[]> {
  const rows = await prisma.leaveRequest.findMany({
    where: { status: LeaveStatus.PENDING },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { user: { select: { id: true, name: true, branchId: true, branch: { select: { name: true, minStaff: true } } } } },
  });

  return Promise.all(
    rows.map(async (r) => {
      if (!r.user.branchId) return { ...r, worst: null };
      const dates: string[] = [];
      const end = toIsoDate(r.endDate);
      for (let cur = toIsoDate(r.startDate); cur <= end; cur = addDaysIso(cur, 1)) dates.push(cur);
      const rowsHc = await branchHeadcount(prisma, r.user.branchId, dates);
      return { ...r, worst: worstDay(rowsHc) };
    }),
  );
}
