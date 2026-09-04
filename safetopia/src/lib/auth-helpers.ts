import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { EmployeeStatus, Role } from "@/generated/prisma/enums";
import type { Session } from "next-auth";

export async function requireSession() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

export async function requireRole(...allowed: Role[]) {
  const session = await requireSession();
  if (!allowed.includes(session.user.role)) {
    redirect("/");
  }
  return session;
}

export function defaultRouteForRole(role: Role): string {
  switch (role) {
    case Role.ADMIN:
      return "/admin/dashboard";
    case Role.EMPLOYEE:
      return "/dashboard";
    default:
      return "/login";
  }
}

export type ActiveUser = {
  id: string;
  loginId: string;
  name: string;
  role: Role;
  branchId: string | null;
  mustChangePassword: boolean;
};

/**
 * 역할 레이아웃 공통 가드. 세션 확인 후 **DB를 한 번 더 읽는다.**
 *
 * JWT는 30일을 살기 때문에 토큰만 믿으면 관리자가 방금 퇴사 처리한 직원이
 * 남은 기간 내내 들어온다. 20명 규모라 요청당 조회 1회는 비용이 아니고,
 * 그 1회가 "비활성화 즉시 차단"과 "첫 로그인 비밀번호 변경 강제"를 둘 다 보장한다.
 *
 * `/account/password`는 이 가드를 쓰지 않는다 — 강제 리다이렉트의 목적지라서.
 */
export async function requireActiveUser(): Promise<{ session: Session; user: ActiveUser }> {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      loginId: true,
      name: true,
      role: true,
      status: true,
      branchId: true,
      mustChangePassword: true,
    },
  });
  if (!user || user.status !== EmployeeStatus.ACTIVE) {
    redirect("/login?error=inactive");
  }
  if (user.mustChangePassword) {
    redirect("/account/password");
  }
  return { session, user };
}

/** 서버 액션용 — 리다이렉트 대신 결과값으로 거부한다. */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== Role.ADMIN) return null;
  return session;
}
