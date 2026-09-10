"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { toActionError, type ActionResult } from "@/lib/errors";
import { DEFAULT_PASSWORD } from "@/lib/passwords";
import { parseDate, toIsoDate, todayKstIso } from "@/lib/utils";
import { accrualOn } from "@/lib/leave-accrual";
import { realignBalances } from "@/lib/leave-period";
import {
  employeeCreateSchema,
  employeeDeleteSchema,
  employeeStatusSchema,
  employeeUpdateSchema,
  resetPasswordSchema,
} from "@/lib/validators";
import {
  AuditAction,
  AuditTargetType,
  BranchStatus,
  EmployeeStatus,
  Role,
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
    if (d.branchId) {
      const err = await assertActiveBranch(d.branchId);
      if (err) return { ok: false, message: err };
    }

    const tempPassword = d.initialPassword ?? DEFAULT_PASSWORD;
    // 입사일이 있으면 현재 회차 행을 바로 만든다 — 1년 넘은 직원을 등록해도 곧장 일수가 잡힌다.
    // totalDays를 비우면 null(자동 계산)로 남고, 값을 넣으면 그 회차만 수동 부여가 된다.
    const balanceCreate = d.hireDate
      ? (() => {
          const { period } = accrualOn(d.hireDate, todayKstIso());
          return {
            create: {
              periodIndex: period.index,
              periodStart: parseDate(period.startIso),
              periodEnd: parseDate(period.endIso),
              totalDays: d.totalDays ?? null,
            },
          };
        })()
      : undefined;

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          loginId: d.loginId,
          password: await bcrypt.hash(tempPassword, 10),
          mustChangePassword: true,
          name: d.name,
          role: d.role,
          branchId: d.branchId,
          hireDate: d.hireDate ? parseDate(d.hireDate) : null,
          leaveBalances: balanceCreate,
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
          metadata: { role: d.role, branchId: d.branchId, totalDays: d.totalDays ?? null, hireDate: d.hireDate },
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
    // 소속 지점은 이름·입사일과 같은 평범한 수정 항목이다(2026-09-10, '지점 이동' 기능 제거).
    const branchTo = d.branchId ?? null;
    const branchMoved = branchTo !== current.branchId;
    if (branchMoved && branchTo) {
      const err = await assertActiveBranch(branchTo);
      if (err) return { ok: false, message: err };
    }
    // 마지막 관리자를 직원으로 강등하면 아무도 관리 화면에 못 들어간다.
    if (current.role === "ADMIN" && d.role !== "ADMIN") {
      const admins = await prisma.user.count({ where: { role: "ADMIN", status: EmployeeStatus.ACTIVE } });
      if (admins <= 1) return { ok: false, message: "마지막 관리자의 권한은 변경할 수 없습니다." };
    }

    const hireDateFrom = current.hireDate ? toIsoDate(current.hireDate) : null;
    const hireDateTo = d.hireDate ?? null;

    const moved = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: d.id },
        data: {
          name: d.name,
          role: d.role,
          branchId: branchTo,
          hireDate: hireDateTo ? parseDate(hireDateTo) : null,
        },
      });
      // 회차 경계는 입사일에서 파생된다. 입사일이 움직이면 저장된 회차 행도 따라 움직여야 한다.
      // periodIndex(불변 신원)는 그대로라 유니크 키도, 신청이 가리키는 행도 흔들리지 않는다.
      if (hireDateTo && hireDateTo !== hireDateFrom) {
        return (await realignBalances(tx, d.id, hireDateTo, todayKstIso())).moved;
      }
      return 0;
    });

    await writeAudit({
      actorId: session.user.id,
      actorName: session.user.name,
      action: AuditAction.UPDATE_EMPLOYEE,
      targetType: AuditTargetType.USER,
      targetId: d.id,
      description: `직원 정보 수정: ${d.name}${hireDateTo !== hireDateFrom ? ` (입사일 ${hireDateFrom ?? "—"} → ${hireDateTo ?? "—"})` : ""}`,
      metadata: {
        hireDateFrom,
        hireDateTo,
        movedPeriods: moved,
        ...(branchMoved ? { branchFrom: current.branchId, branchTo } : {}),
      },
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

export async function resetEmployeePassword(
  input: unknown,
): Promise<ActionResult<{ tempPassword: string }>> {
  const session = await requireAdmin();
  if (!session) return UNAUTHORIZED;
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  try {
    const tempPassword = DEFAULT_PASSWORD;
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

/**
 * 직원 완전 삭제. 퇴사 처리(changeEmployeeStatus)와 달리 되돌릴 수 없다 —
 * 연차 신청·차감일·잔액·조정이 DB cascade로 함께 사라진다(schema.prisma의 onDelete).
 * 남는 것은 감사 로그뿐이고, 그마저 actorId는 SET NULL이라 actorName 스냅샷이 이력을 지탱한다.
 */
export async function deleteEmployee(input: unknown): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) return UNAUTHORIZED;
  const parsed = employeeDeleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { id } = parsed.data;

  try {
    if (id === session.user.id) return { ok: false, message: "자기 자신은 삭제할 수 없습니다." };

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return { ok: false, message: "직원을 찾을 수 없습니다." };

    // 마지막 관리자를 지우면 아무도 관리 화면에 못 들어간다(강등 가드와 같은 취지).
    if (user.role === Role.ADMIN) {
      const admins = await prisma.user.count({ where: { role: Role.ADMIN, status: EmployeeStatus.ACTIVE } });
      if (admins <= 1) return { ok: false, message: "마지막 관리자는 삭제할 수 없습니다." };
    }

    const leaveRequests = await prisma.leaveRequest.count({ where: { userId: id } });

    await prisma.$transaction(async (tx) => {
      // 감사 로그를 먼저 남긴다 — targetId는 FK가 아니라 행이 지워져도 로그는 살아남는다.
      await writeAudit(
        {
          actorId: session.user.id,
          actorName: session.user.name,
          action: AuditAction.DELETE_EMPLOYEE,
          targetType: AuditTargetType.USER,
          targetId: user.id,
          description: `직원 삭제: ${user.name}(${user.loginId})`,
          metadata: {
            role: user.role,
            branchId: user.branchId,
            hireDate: user.hireDate ? toIsoDate(user.hireDate) : null,
            leaveRequests,
          },
        },
        tx,
      );
      await tx.user.delete({ where: { id } });
    });

    revalidatePath("/admin/calendar");
    revalidate();
    return { ok: true };
  } catch (err) {
    return toActionError(err, "deleteEmployee");
  }
}
