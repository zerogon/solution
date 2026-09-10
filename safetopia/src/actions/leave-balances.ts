"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { LeaveError, toActionError, type ActionResult } from "@/lib/errors";
import { formatPeriodLabel, periodByIndex } from "@/lib/leave-accrual";
import { summarize, withGranted } from "@/lib/leave-balance";
import { lockPeriodBalance, requireHireIso } from "@/lib/leave-period";
import { todayKstIso } from "@/lib/utils";
import { formatDays } from "@/lib/labels";
import { leaveAdjustSchema, leaveGrantSchema } from "@/lib/validators";
import { AuditAction, AuditTargetType } from "@/generated/prisma/enums";

const UNAUTHORIZED = { ok: false, message: "관리자만 사용할 수 있습니다." } as const;

function revalidate(userId: string) {
  revalidatePath(`/admin/employees/${userId}`);
  revalidatePath("/admin/employees");
  revalidatePath("/admin/leaves");
  revalidatePath("/dashboard");
  revalidatePath("/profile");
}

/**
 * 회차의 수동 부여·이월을 설정한다. 사용·조정 누계는 건드리지 않는다.
 *
 * `totalDays: null`은 **수동 부여 해제** — 입사일 기준 자동 계산으로 돌아간다.
 */
export async function grantLeave(input: unknown): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return UNAUTHORIZED;
  const parsed = leaveGrantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { id: d.userId },
      select: { id: true, name: true, hireDate: true },
    });
    if (!user) return { ok: false, message: "직원을 찾을 수 없습니다." };

    const today = todayKstIso();
    const period = periodByIndex(requireHireIso(user), d.periodIndex);

    await prisma.$transaction(async (tx) => {
      // 잠금은 lockPeriodBalance가 잡는다 — 동시에 들어온 신청(usedDays 증가)이 낡은 값 위에
      // 검증되는 것을 막는다. 행이 없으면 여기서 만들어진다.
      const { balance, autoDays } = await lockPeriodBalance(tx, user, period.startIso, today);
      const updated = await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { totalDays: d.totalDays, carriedOverDays: d.carriedOverDays },
      });
      // 부여를 줄여서 이미 사용한 분보다 적어지면 잔여가 음수가 된다 — 원칙적 불허.
      if (summarize(withGranted(updated, autoDays)).remaining < 0) {
        throw new LeaveError(`이미 사용한 ${formatDays(updated.usedDays)}보다 적게 부여할 수 없습니다.`);
      }
      const granted = d.totalDays === null ? `자동 계산(${formatDays(autoDays)})` : `수동 ${formatDays(d.totalDays)}`;
      await writeAudit(
        {
          actorId: session.user.id,
          actorName: session.user.name,
          action: AuditAction.GRANT_LEAVE,
          targetType: AuditTargetType.LEAVE_BALANCE,
          targetId: balance.id,
          description: `${user.name} ${formatPeriodLabel(period)} 부여 ${granted} + 이월 ${formatDays(d.carriedOverDays)}`,
          metadata: {
            userId: d.userId,
            periodIndex: d.periodIndex,
            totalDays: d.totalDays,
            carriedOverDays: d.carriedOverDays,
          },
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
    const user = await prisma.user.findUnique({
      where: { id: d.userId },
      select: { id: true, name: true, hireDate: true },
    });
    if (!user) return { ok: false, message: "직원을 찾을 수 없습니다." };

    const today = todayKstIso();
    const period = periodByIndex(requireHireIso(user), d.periodIndex);

    await prisma.$transaction(async (tx) => {
      const { balance, autoDays } = await lockPeriodBalance(tx, user, period.startIso, today);

      const after = summarize(withGranted({ ...balance, adjustedDays: balance.adjustedDays + d.amount }, autoDays));
      if (after.remaining < 0) {
        throw new LeaveError(`조정 후 잔여가 음수가 됩니다. (잔여 ${formatDays(after.remaining)})`);
      }

      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { adjustedDays: { increment: d.amount } },
      });
      await tx.leaveAdjustment.create({
        data: {
          userId: d.userId,
          periodIndex: d.periodIndex,
          amount: d.amount,
          reason: d.reason,
          createdById: session.user.id,
        },
      });
      await writeAudit(
        {
          actorId: session.user.id,
          actorName: session.user.name,
          action: AuditAction.ADJUST_LEAVE,
          targetType: AuditTargetType.LEAVE_BALANCE,
          targetId: balance.id,
          description: `${user.name} ${formatPeriodLabel(period)} 조정 ${d.amount > 0 ? "+" : ""}${d.amount} — ${d.reason}`,
          metadata: { userId: d.userId, periodIndex: d.periodIndex, amount: d.amount, reason: d.reason },
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
