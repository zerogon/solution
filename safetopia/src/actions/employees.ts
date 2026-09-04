"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { toActionError, type ActionResult } from "@/lib/errors";
import { generateTempPassword } from "@/lib/passwords";
import { parseDate } from "@/lib/utils";
import {
  employeeBranchChangeSchema,
  employeeCreateSchema,
  employeeStatusSchema,
  employeeUpdateSchema,
  resetPasswordSchema,
} from "@/lib/validators";
import {
  AuditAction,
  AuditTargetType,
  BranchStatus,
  EmployeeStatus,
} from "@/generated/prisma/enums";

const UNAUTHORIZED = { ok: false, message: "관리자만 사용할 수 있습니다." } as const;

function revalidate(id?: string) {
  revalidatePath("/admin/employees");
  if (id) revalidatePath(`/admin/employees/${id}`);
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/leaves");
}

async function assertActiveBranch(branchId: string) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } });
  if (!branch) return "지점을 찾을 수 없습니다.";
  if (branch.status !== BranchStatus.ACTIVE) return "비활성 지점에는 배정할 수 없습니다.";
  return null;
}

export async function createEmployee(
  input: unknown,
): Promise<ActionResult<{ id: string; loginId: string; tempPassword: string }>> {
  const session = await requireAdmin();
  if (!session) return UNAUTHORIZED;
  const parsed = employeeCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    if (await prisma.user.findUnique({ where: { loginId: d.loginId } })) {
      return { ok: false, message: "이미 사용 중인 아이디입니다." };
    }
    if (d.email && (await prisma.user.findUnique({ where: { email: d.email } }))) {
      return { ok: false, message: "이미 등록된 이메일입니다." };
    }
    if (d.branchId) {
      const err = await assertActiveBranch(d.branchId);
      if (err) return { ok: false, message: err };
    }

    const tempPassword = d.initialPassword ?? generateTempPassword();
    const year = new Date().getUTCFullYear();

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          loginId: d.loginId,
          password: await bcrypt.hash(tempPassword, 10),
          mustChangePassword: true,
          name: d.name,
          email: d.email,
          phone: d.phone,
          role: d.role,
          branchId: d.branchId,
          hireDate: d.hireDate ? parseDate(d.hireDate) : null,
          leaveBalances:
            d.totalDays !== undefined ? { create: { year, totalDays: d.totalDays } } : undefined,
          branchHistories: d.branchId
            ? { create: { toBranchId: d.branchId, changedById: session.user.id, reason: "최초 배정" } }
            : undefined,
        },
      });
      await writeAudit(
        {
          actorId: session.user.id,
          actorName: session.user.name,
          action: AuditAction.CREATE_EMPLOYEE,
          targetType: AuditTargetType.USER,
          targetId: created.id,
          description: `직원 등록: ${created.name}(${created.loginId})`,
          metadata: { role: d.role, branchId: d.branchId, totalDays: d.totalDays ?? null },
        },
        tx,
      );
      return created;
    });

    revalidate();
    return { ok: true, data: { id: user.id, loginId: user.loginId, tempPassword } };
  } catch (err) {
    return toActionError(err, "createEmployee");
  }
}

export async function updateEmployee(input: unknown): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return UNAUTHORIZED;
  const parsed = employeeUpdateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const current = await prisma.user.findUnique({ where: { id: d.id } });
    if (!current) return { ok: false, message: "직원을 찾을 수 없습니다." };
    // 소속 변경은 이력이 남는 별도 액션(changeEmployeeBranch)으로만.
    if ((d.branchId ?? null) !== current.branchId) {
      return { ok: false, message: "소속 지점은 '지점 이동'에서 변경해주세요." };
    }
    if (d.email && d.email !== current.email) {
      const dup = await prisma.user.findUnique({ where: { email: d.email } });
      if (dup) return { ok: false, message: "이미 등록된 이메일입니다." };
    }
    // 마지막 관리자를 직원으로 강등하면 아무도 관리 화면에 못 들어간다.
    if (current.role === "ADMIN" && d.role !== "ADMIN") {
      const admins = await prisma.user.count({ where: { role: "ADMIN", status: EmployeeStatus.ACTIVE } });
      if (admins <= 1) return { ok: false, message: "마지막 관리자의 권한은 변경할 수 없습니다." };
    }

    await prisma.user.update({
      where: { id: d.id },
      data: {
        name: d.name,
        email: d.email,
        phone: d.phone,
        role: d.role,
        hireDate: d.hireDate ? parseDate(d.hireDate) : null,
      },
    });
    await writeAudit({
      actorId: session.user.id,
      actorName: session.user.name,
      action: AuditAction.UPDATE_EMPLOYEE,
      targetType: AuditTargetType.USER,
      targetId: d.id,
      description: `직원 정보 수정: ${d.name}`,
    });
    revalidate(d.id);
    return { ok: true };
  } catch (err) {
    return toActionError(err, "updateEmployee");
  }
}

export async function changeEmployeeStatus(input: unknown): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return UNAUTHORIZED;
  const parsed = employeeStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  try {
    if (parsed.data.id === session.user.id && parsed.data.status !== EmployeeStatus.ACTIVE) {
      return { ok: false, message: "자기 자신을 비활성화할 수 없습니다." };
    }
    const user = await prisma.user.update({
      where: { id: parsed.data.id },
      data: { status: parsed.data.status },
    });
    await writeAudit({
      actorId: session.user.id,
      actorName: session.user.name,
      action: AuditAction.CHANGE_EMPLOYEE_STATUS,
      targetType: AuditTargetType.USER,
      targetId: user.id,
      description: `${user.name} 재직 상태 → ${parsed.data.status}`,
    });
    revalidate(user.id);
    return { ok: true };
  } catch (err) {
    return toActionError(err, "changeEmployeeStatus");
  }
}

export async function changeEmployeeBranch(input: unknown): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return UNAUTHORIZED;
  const parsed = employeeBranchChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const d = parsed.data;

  try {
    const err = await assertActiveBranch(d.toBranchId);
    if (err) return { ok: false, message: err };
    const user = await prisma.user.findUnique({ where: { id: d.id } });
    if (!user) return { ok: false, message: "직원을 찾을 수 없습니다." };
    if (user.branchId === d.toBranchId) return { ok: false, message: "이미 해당 지점 소속입니다." };

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: d.id }, data: { branchId: d.toBranchId } });
      await tx.branchHistory.create({
        data: {
          userId: d.id,
          fromBranchId: user.branchId,
          toBranchId: d.toBranchId,
          changedById: session.user.id,
          reason: d.reason,
        },
      });
      await writeAudit(
        {
          actorId: session.user.id,
          actorName: session.user.name,
          action: AuditAction.CHANGE_BRANCH,
          targetType: AuditTargetType.USER,
          targetId: d.id,
          description: `${user.name} 지점 이동`,
          metadata: { from: user.branchId, to: d.toBranchId, reason: d.reason },
        },
        tx,
      );
    });
    revalidate(d.id);
    return { ok: true };
  } catch (err) {
    return toActionError(err, "changeEmployeeBranch");
  }
}

export async function resetEmployeePassword(
  input: unknown,
): Promise<ActionResult<{ tempPassword: string }>> {
  const session = await requireAdmin();
  if (!session) return UNAUTHORIZED;
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  try {
    const tempPassword = parsed.data.newPassword ?? generateTempPassword();
    const user = await prisma.user.update({
      where: { id: parsed.data.id },
      data: { password: await bcrypt.hash(tempPassword, 10), mustChangePassword: true },
    });
    await writeAudit({
      actorId: session.user.id,
      actorName: session.user.name,
      action: AuditAction.RESET_PASSWORD,
      targetType: AuditTargetType.USER,
      targetId: user.id,
      description: `${user.name} 비밀번호 초기화`,
    });
    revalidate(user.id);
    return { ok: true, data: { tempPassword } };
  } catch (err) {
    return toActionError(err, "resetEmployeePassword");
  }
}
