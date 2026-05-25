import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Role } from "@/generated/prisma/enums";

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
      return "/admin";
    case Role.TEACHER:
      return "/teacher";
    case Role.STUDENT:
      return "/student";
    default:
      return "/login";
  }
}
