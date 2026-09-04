import { prisma } from "@/lib/prisma";
import { summarize, type BalanceSummary } from "@/lib/leave-balance";
import { parseDate } from "@/lib/utils";
import { LeaveStatus } from "@/generated/prisma/enums";

/** 직원 한 명의 특정 연도 잔여 요약. balance 행이 없으면 null(= 아직 미부여). */
export async function getBalanceSummary(userId: string, year: number): Promise<BalanceSummary | null> {
  const [balance, pending] = await Promise.all([
    prisma.leaveBalance.findUnique({ where: { userId_year: { userId, year } } }),
    prisma.leaveRequest.aggregate({
      _sum: { days: true },
      where: {
        userId,
        status: LeaveStatus.PENDING,
        startDate: { gte: parseDate(`${year}-01-01`), lte: parseDate(`${year}-12-31`) },
      },
    }),
  ]);
  if (!balance) return null;
  return summarize(balance, pending._sum.days ?? 0);
}

/** 여러 직원의 같은 연도 요약을 한 번에. 관리자 목록·현황 표용. */
export async function getBalanceSummaries(userIds: string[], year: number): Promise<Map<string, BalanceSummary>> {
  if (userIds.length === 0) return new Map();
  const [balances, pendingRows] = await Promise.all([
    prisma.leaveBalance.findMany({ where: { userId: { in: userIds }, year } }),
    prisma.leaveRequest.groupBy({
      by: ["userId"],
      where: {
        userId: { in: userIds },
        status: LeaveStatus.PENDING,
        startDate: { gte: parseDate(`${year}-01-01`), lte: parseDate(`${year}-12-31`) },
      },
      _sum: { days: true },
    }),
  ]);
  const pending = new Map(pendingRows.map((r) => [r.userId, r._sum.days ?? 0]));
  return new Map(balances.map((b) => [b.userId, summarize(b, pending.get(b.userId) ?? 0)]));
}
