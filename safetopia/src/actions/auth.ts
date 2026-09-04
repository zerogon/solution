"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { auth, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import { writeAudit } from "@/lib/audit";
import { changePasswordSchema, loginSchema } from "@/lib/validators";
import type { ActionResult } from "@/lib/errors";
import { AuditAction, AuditTargetType } from "@/generated/prisma/enums";

// dev/http: "authjs.session-token", prod/https: "__Secure-authjs.session-token"
const SESSION_TOKEN_BASE = ["authjs.session-token", "__Secure-authjs.session-token"];

/**
 * "로그인 유지하기" 미체크 시 호출. next-auth가 발급한 세션 토큰 쿠키의 만료를
 * 제거해, 브라우저 종료 시 사라지는 세션 쿠키로 강등한다. (next-auth v5는 요청별
 * 쿠키 만료 제어를 기본 지원하지 않아, 로그인 직후 쿠키를 재작성한다.)
 */
async function demoteSessionTokenToSessionScope() {
  const store = await cookies();
  for (const c of store.getAll()) {
    const isToken = SESSION_TOKEN_BASE.some(
      (n) => c.name === n || c.name.startsWith(n + "."), // 청크(.0/.1) 포함
    );
    if (!isToken) continue;
    store.set(c.name, c.value, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: c.name.startsWith("__Secure-"), // __Secure- 접두사는 secure 필수
      // maxAge/expires 생략 → 세션 쿠키
    });
  }
}

export async function loginAction(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = loginSchema.safeParse({
    loginId: formData.get("loginId"),
    password: formData.get("password") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  const rememberMe = formData.get("rememberMe") === "true";

  try {
    await signIn("credentials", {
      loginId: parsed.data.loginId,
      password: parsed.data.password,
      redirect: false,
    });
    // 체크(기본)면 next-auth 기본 30일 지속 쿠키 유지, 미체크면 세션 쿠키로 강등
    if (!rememberMe) await demoteSessionTokenToSessionScope();
  } catch {
    return { ok: false, message: "아이디 또는 비밀번호가 올바르지 않습니다." };
  }

  // 로그인 감사 기록은 best-effort — 실패해도 로그인은 성공이다.
  try {
    const session = await auth();
    if (session?.user) {
      await writeAudit({
        actorId: session.user.id,
        actorName: session.user.name,
        action: AuditAction.LOGIN,
        targetType: AuditTargetType.USER,
        targetId: session.user.id,
      });
    }
  } catch (err) {
    console.error("[loginAction] audit", err);
  }
  return { ok: true };
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

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return { ok: false, message: "사용자를 찾을 수 없습니다." };

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.password);
  if (!ok) return { ok: false, message: "현재 비밀번호가 올바르지 않습니다." };
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    return { ok: false, message: "새 비밀번호가 현재 비밀번호와 같습니다." };
  }

  const newHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: newHash, mustChangePassword: false },
  });

  return { ok: true };
}
