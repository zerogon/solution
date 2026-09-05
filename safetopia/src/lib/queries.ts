import { prisma } from "@/lib/prisma";
import { summarize, type BalanceSummary } from "@/lib/leave-balance";

/** 직원 한 명의 특정 연도 잔여 요약. balance 행이 없으면 null(= 아직 미부여). */
export async function getBalanceSummary(userId: string, year: number): Promise<BalanceSummary | null> {
  const balance = await prisma.leaveBalance.findUnique({ where: { userId_year: { userId, year } } });
  if (!balance) return null;
  return summarize(balance);
}

/** 여러 직원의 같은 연도 요약을 한 번에. 관리자 목록·현황 표용. */
export async function getBalanceSummaries(userIds: string[], year: number): Promise<Map<string, BalanceSummary>> {
  if (userIds.length === 0) return new Map();
  const balances = await prisma.leaveBalance.findMany({ where: { userId: { in: userIds }, year } });
  return new Map(balances.map((b) => [b.userId, summarize(b)]));
}
