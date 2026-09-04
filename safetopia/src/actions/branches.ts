"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { toActionError, type ActionResult } from "@/lib/errors";
import { branchSchema, branchStatusSchema, branchUpdateSchema } from "@/lib/validators";
import {
  AuditAction,
  AuditTargetType,
  BranchStatus,
  EmployeeStatus,
} from "@/generated/prisma/enums";

const UNAUTHORIZED = { ok: false, message: "관리자만 사용할 수 있습니다." } as const;

function revalidate() {
  revalidatePath("/admin/branches");
  revalidatePath("/admin/employees");
  revalidatePath("/admin/dashboard");
}

export async function createBranch(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireAdmin();
  if (!session) return UNAUTHORIZED;
  const parsed = branchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  try {
    const exists = await prisma.branch.findUnique({ where: { name: parsed.data.name } });
    if (exists) return { ok: false, message: "같은 이름의 지점이 이미 있습니다." };

    const branch = await prisma.branch.create({
      data: { ...parsed.data, minStaff: parsed.data.minStaff ?? null },
    });
    await writeAudit({
      actorId: session.user.id,
      actorName: session.user.name,
      action: AuditAction.CREATE_BRANCH,
      targetType: AuditTargetType.BRANCH,
      targetId: branch.id,
      description: `지점 등록: ${branch.name}`,
    });
    revalidate();
    return { ok: true, data: { id: branch.id } };
  } catch (err) {
    return toActionError(err, "createBranch");
  }
}

export async function updateBranch(input: unknown): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return UNAUTHORIZED;
  const parsed = branchUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  try {
    const { id, ...data } = parsed.data;
    const dup = await prisma.branch.findFirst({ where: { name: data.name, id: { not: id } } });
    if (dup) return { ok: false, message: "같은 이름의 지점이 이미 있습니다." };

    const branch = await prisma.branch.update({
      where: { id },
      data: { ...data, minStaff: data.minStaff ?? null },
    });
    await writeAudit({
      actorId: session.user.id,
      actorName: session.user.name,
      action: AuditAction.UPDATE_BRANCH,
      targetType: AuditTargetType.BRANCH,
      targetId: branch.id,
      description: `지점 수정: ${branch.name}`,
      metadata: { closedWeekdays: data.closedWeekdays, minStaff: data.minStaff ?? null },
    });
    revalidate();
    return { ok: true };
  } catch (err) {
    return toActionError(err, "updateBranch");
  }
}

export async function changeBranchStatus(input: unknown): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return UNAUTHORIZED;
  const parsed = branchStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  try {
    if (parsed.data.status === BranchStatus.INACTIVE) {
      // 소속 재직 직원이 있으면 먼저 옮겨야 한다 — 직원의 휴무 요일·근무 인원 집계가 지점에 매여 있다.
      const active = await prisma.user.count({
        where: { branchId: parsed.data.id, status: EmployeeStatus.ACTIVE },
      });
      if (active > 0) {
        return { ok: false, message: `재직 중인 직원 ${active}명이 소속되어 있습니다. 먼저 다른 지점으로 이동시켜주세요.` };
      }
    }
    const branch = await prisma.branch.update({
      where: { id: parsed.data.id },
      data: { status: parsed.data.status },
    });
    await writeAudit({
      actorId: session.user.id,
      actorName: session.user.name,
      action: AuditAction.CHANGE_BRANCH_STATUS,
      targetType: AuditTargetType.BRANCH,
      targetId: branch.id,
      description: `지점 ${branch.name} → ${parsed.data.status}`,
    });
    revalidate();
    return { ok: true };
  } catch (err) {
    return toActionError(err, "changeBranchStatus");
  }
}
