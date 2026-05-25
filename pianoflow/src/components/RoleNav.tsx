import Link from "next/link";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Role } from "@/generated/prisma/enums";
import { logoutAction } from "@/actions/auth";

const NAV_BY_ROLE: Record<Role, { href: string; label: string }[]> = {
  [Role.STUDENT]: [
    { href: "/student", label: "내 레슨" },
    { href: "/student/book", label: "예약하기" },
    { href: "/student/history", label: "내역" },
  ],
  [Role.TEACHER]: [
    { href: "/teacher", label: "내 일정" },
    { href: "/teacher/students", label: "학생" },
    { href: "/teacher/peek", label: "다른 선생님" },
  ],
  [Role.ADMIN]: [
    { href: "/admin", label: "대시보드" },
    { href: "/admin/members", label: "회원" },
    { href: "/admin/reservations", label: "예약" },
  ],
};

export async function RoleNav() {
  const session = await auth();
  if (!session?.user) return null;
  const nav = NAV_BY_ROLE[session.user.role] ?? [];
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-3 overflow-x-auto">
          <Link href="/" className="font-bold tracking-tight">
            PianoFlow
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {session.user.name}
          </span>
          <form action={logoutAction}>
            <Button type="submit" size="sm" variant="outline">
              로그아웃
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
