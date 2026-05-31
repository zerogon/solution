"use server";

import bcrypt from "bcryptjs";
import { auth, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  changePasswordSchema,
  loginIdSchema,
  loginSchema,
} from "@/lib/validators";
import type { ActionResult } from "@/lib/errors";
import { Role, UserStatus } from "@/generated/prisma/enums";

export async function loginAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    loginId: formData.get("loginId"),
    // 비밀번호 미입력(학생) 시 null이 들어오므로 undefined로 정규화
    password: formData.get("password") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  try {
    await signIn("credentials", {
      loginId: parsed.data.loginId,
      password: parsed.data.password ?? "",
      redirect: false,
    });
    return { ok: true };
  } catch {
    return { ok: false, message: "로그인 ID 또는 비밀번호가 올바르지 않습니다." };
  }
}

/**
 * 로그인 ID 사전 조회. 학생은 비밀번호 없이 로그인하므로 화면에서
 * 비밀번호 팝업 노출 여부를 판단하기 위해 사용한다.
 */
export async function checkLoginId(
  loginId: string,
): Promise<{ found: boolean; needsPassword: boolean }> {
  const parsed = loginIdSchema.safeParse(loginId);
  if (!parsed.success) return { found: false, needsPassword: false };

  const user = await prisma.user.findUnique({
    where: { loginId: parsed.data },
    select: { role: true, status: true },
  });
  if (!user || user.status !== UserStatus.ACTIVE) {
    return { found: false, needsPassword: false };
  }
  return { found: true, needsPassword: user.role !== Role.STUDENT };
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function changePasswordAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, message: "로그인이 필요합니다." };

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) return { ok: false, message: "사용자를 찾을 수 없습니다." };

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.password);
  if (!ok) return { ok: false, message: "현재 비밀번호가 올바르지 않습니다." };

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: newHash, mustChangePassword: false },
  });

  return { ok: true };
}
