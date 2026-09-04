"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { LeaveError, toActionError, type ActionResult } from "@/lib/errors";
import { summarize } from "@/lib/leave-balance";
import { formatDays } from "@/lib/labels";
import { parseDate } from "@/lib/utils";
import { leaveAdjustSchema, leaveGrantSchema } from "@/lib/validators";
import { AuditAction, AuditTargetType, LeaveStatus } from "@/generated/prisma/enums";

const UNAUTHORIZED = { ok: false, message: "관리자만 사용할 수 있습니다." } as const;

function revalidate(userId: string) {
  revalidatePath(`/admin/employees/${userId}`);
  revalidatePath("/admin/employees");
  revalidatePath("/admin/leaves");
  revalidatePath("/dashboard");
  revalidatePath("/profile");
}

/** 연도별 기본 부여·이월을 설정한다(upsert). 사용·조정 누계는 건드리지 않는다. */
export async function grantLeave(input: unknown): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return UNAUTHORIZED;
  const parsed = leaveGrantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const user = await prisma.user.findUnique({ where: { id: d.userId }, select: { name: true } });
    if (!user) return { ok: false, message: "직원을 찾을 수 없습니다." };

    await prisma.$transaction(async (tx) => {
      const balance = await tx.leaveBalance.upsert({
        where: { userId_year: { userId: d.userId, year: d.year } },
        create: { userId: d.userId, year: d.year, totalDays: d.totalDays, carriedOverDays: d.carriedOverDays },
        update: { totalDays: d.totalDays, carriedOverDays: d.carriedOverDays },
      });
      // 부여를 줄여서 이미 승인된 사용분보다 적어지면 잔여가 음수가 된다 — 원칙적 불허.
      if (summarize(balance, 0).remaining < 0) {
        throw new LeaveError(`이미 사용한 ${formatDays(balance.usedDays)}보다 적게 부여할 수 없습니다.`);
      }
      await writeAudit(
        {
          actorId: session.user.id,
          actorName: session.user.name,
          action: AuditAction.GRANT_LEAVE,
          targetType: AuditTargetType.LEAVE_BALANCE,
          targetId: balance.id,
          description: `${user.name} ${d.year}년 연차 부여 ${formatDays(d.totalDays)} + 이월 ${formatDays(d.carriedOverDays)}`,
          metadata: { userId: d.userId, year: d.year, totalDays: d.totalDays, carriedOverDays: d.carriedOverDays },
        },
        tx,
      );
    });
    revalidate(d.userId);
    return { ok: true };
  } catch (err) {
    return toActionError(err, "grantLeave");
  }
}

/** 수동 조정(+/-). 반드시 사유와 함께 LeaveAdjustment 이력을 남긴다 (FR-004). */
export async function adjustLeave(input: unknown): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return UNAUTHORIZED;
  const parsed = leaveAdjustSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const user = await prisma.user.findUnique({ where: { id: d.userId }, select: { name: true } });
    if (!user) return { ok: false, message: "직원을 찾을 수 없습니다." };

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM leave_balances WHERE user_id = ${d.userId} AND year = ${d.year} FOR UPDATE`;
      const balance = await tx.leaveBalance.findUnique({ where: { userId_year: { userId: d.userId, year: d.year } } });
      if (!balance) throw new LeaveError(`${d.year}년 연차가 아직 부여되지 않았습니다. 먼저 부여해주세요.`);

      const pending = await tx.leaveRequest.aggregate({
        _sum: { days: true },
        where: {
          userId: d.userId,
          status: LeaveStatus.PENDING,
          startDate: { gte: parseDate(`${d.year}-01-01`), lte: parseDate(`${d.year}-12-31`) },
        },
      });
      const after = summarize({ ...balance, adjustedDays: balance.adjustedDays + d.amount }, pending._sum.days ?? 0);
      if (after.remaining < 0) {
        throw new LeaveError(`조정 후 잔여가 음수가 됩니다. (잔여 ${formatDays(after.remaining)})`);
      }

      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { adjustedDays: { increment: d.amount } },
      });
      await tx.leaveAdjustment.create({
        data: { userId: d.userId, year: d.year, amount: d.amount, reason: d.reason, createdById: session.user.id },
      });
      await writeAudit(
        {
          actorId: session.user.id,
          actorName: session.user.name,
          action: AuditAction.ADJUST_LEAVE,
          targetType: AuditTargetType.LEAVE_BALANCE,
          targetId: balance.id,
          description: `${user.name} ${d.year}년 연차 조정 ${d.amount > 0 ? "+" : ""}${d.amount} — ${d.reason}`,
          metadata: { userId: d.userId, year: d.year, amount: d.amount, reason: d.reason },
        },
        tx,
      );
    });
    revalidate(d.userId);
    return { ok: true };
  } catch (err) {
    return toActionError(err, "adjustLeave");
  }
}
