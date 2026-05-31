"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateLoginId, getPhoneLast4 } from "@/lib/login-id";
import {
  creditAdjustSchema,
  memberCreateSchema,
  memberUpdateSchema,
  teacherCredentialSchema,
} from "@/lib/validators";
import type { ActionResult } from "@/lib/errors";
import {
  CreditChangeReason,
  Role,
  UserStatus,
} from "@/generated/prisma/enums";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== Role.ADMIN) {
    throw new Error("관리자 권한이 필요합니다.");
  }
  return session;
}

export async function adminCreateMember(
  _prev: ActionResult<{ loginId: string; tempPassword: string }> | undefined,
  formData: FormData,
): Promise<ActionResult<{ loginId: string; tempPassword: string }>> {
  try {
    await requireAdmin();
    const parsed = memberCreateSchema.safeParse({
      name: formData.get("name"),
      phone: formData.get("phone"),
      role: formData.get("role"),
      remainingLessons: Number(formData.get("remainingLessons") ?? 0),
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0].message };
    }

    try {
      // 로그인 ID = 휴대폰 8자리, 초기 비밀번호 = 휴대폰 끝 4자리
      const loginId = await generateLoginId(prisma, parsed.data.phone);
      const initialPassword = getPhoneLast4(parsed.data.phone);
      const hash = await bcrypt.hash(initialPassword, 10);
      await prisma.user.create({
        data: {
          name: parsed.data.name,
          phone: parsed.data.phone,
          loginId,
          password: hash,
          mustChangePassword: false,
          role: parsed.data.role,
          status: UserStatus.ACTIVE,
          remainingLessons: parsed.data.remainingLessons,
        },
      });
      revalidatePath("/admin/members");
      return { ok: true, data: { loginId, tempPassword: initialPassword } };
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        return { ok: false, message: "이미 등록된 휴대폰 번호입니다." };
      }
      throw err;
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "회원 생성에 실패했습니다.",
    };
  }
}

export async function adminUpdateMember(input: {
  id: string;
  name?: string;
  phone?: string;
  role?: Role;
  remainingLessons?: number;
}): Promise<ActionResult> {
  try {
    await requireAdmin();
    const parsed = memberUpdateSchema.safeParse({
      name: input.name,
      phone: input.phone,
      role: input.role,
      remainingLessons: input.remainingLessons,
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0].message };
    }

    await prisma.user.update({
      where: { id: input.id },
      data: parsed.data,
    });
    revalidatePath("/admin/members");
    revalidatePath(`/admin/members/${input.id}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "수정에 실패했습니다.",
    };
  }
}

export async function adminSetStatus(input: {
  id: string;
  status: UserStatus;
}): Promise<ActionResult> {
  try {
    await requireAdmin();
    await prisma.user.update({
      where: { id: input.id },
      data: { status: input.status },
    });
    revalidatePath("/admin/members");
    revalidatePath(`/admin/members/${input.id}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "상태 변경에 실패했습니다.",
    };
  }
}

export async function adminAdjustCredits(input: {
  studentId: string;
  delta: number;
  memo?: string;
}): Promise<ActionResult> {
  try {
    const session = await requireAdmin();
    const parsed = creditAdjustSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0].message };
    }

    await prisma.$transaction(async (tx) => {
      const student = await tx.user.findUnique({ where: { id: parsed.data.studentId } });
      if (!student) throw new Error("학생을 찾을 수 없습니다.");
      const next = student.remainingLessons + parsed.data.delta;
      if (next < 0) throw new Error("남은 횟수가 0보다 작을 수 없습니다.");
      await tx.user.update({
        where: { id: student.id },
        data: { remainingLessons: next },
      });
      await tx.lessonCreditLog.create({
        data: {
          studentId: student.id,
          delta: parsed.data.delta,
          reason:
            parsed.data.delta > 0
              ? CreditChangeReason.ADMIN_ADD
              : CreditChangeReason.ADMIN_SUB,
          actorId: session.user.id,
          memo: parsed.data.memo,
        },
      });
    });

    revalidatePath("/admin/members");
    revalidatePath(`/admin/members/${input.studentId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "크레딧 조정에 실패했습니다.",
    };
  }
}

export async function adminUpdateTeacherCredentials(input: {
  teacherId: string;
  loginId?: string;
  newPassword?: string;
}): Promise<ActionResult> {
  try {
    await requireAdmin();
    const parsed = teacherCredentialSchema.safeParse({
      teacherId: input.teacherId,
      loginId: input.loginId,
      newPassword: input.newPassword,
    });
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0].message };
    }

    const teacher = await prisma.user.findUnique({
      where: { id: parsed.data.teacherId },
      select: { role: true },
    });
    if (!teacher || teacher.role !== Role.TEACHER) {
      return { ok: false, message: "선생님을 찾을 수 없습니다." };
    }

    const data: { loginId?: string; password?: string } = {};
    if (parsed.data.loginId !== undefined) data.loginId = parsed.data.loginId;
    if (parsed.data.newPassword !== undefined) {
      data.password = await bcrypt.hash(parsed.data.newPassword, 10);
    }

    try {
      await prisma.user.update({
        where: { id: parsed.data.teacherId },
        data,
      });
    } catch (err) {
      if (
        typeof err === "object" &&
        err !== null &&
        "code" in err &&
        (err as { code?: string }).code === "P2002"
      ) {
        return { ok: false, message: "이미 사용 중인 로그인 ID입니다." };
      }
      throw err;
    }

    revalidatePath("/admin/members");
    revalidatePath(`/admin/members/${parsed.data.teacherId}`);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "자격증명 변경에 실패했습니다.",
    };
  }
}

export async function adminResetPassword(input: {
  id: string;
}): Promise<ActionResult<{ tempPassword: string }>> {
  try {
    await requireAdmin();
    const user = await prisma.user.findUnique({
      where: { id: input.id },
      select: { phone: true },
    });
    if (!user) return { ok: false, message: "사용자를 찾을 수 없습니다." };
    // 초기 비밀번호 = 휴대폰 끝 4자리
    const initialPassword = getPhoneLast4(user.phone);
    const hash = await bcrypt.hash(initialPassword, 10);
    await prisma.user.update({
      where: { id: input.id },
      data: { password: hash, mustChangePassword: false },
    });
    revalidatePath(`/admin/members/${input.id}`);
    return { ok: true, data: { tempPassword: initialPassword } };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "비밀번호 초기화 실패",
    };
  }
}
