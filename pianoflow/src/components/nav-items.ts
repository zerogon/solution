import {
  Calendar,
  BookOpen,
  History,
  Users,
  Eye,
  LayoutDashboard,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { Role } from "@/generated/prisma/enums";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  [Role.STUDENT]: [
    { href: "/student", label: "내 레슨", icon: Calendar },
    { href: "/student/book", label: "예약", icon: BookOpen },
    { href: "/student/history", label: "내역", icon: History },
  ],
  [Role.TEACHER]: [
    { href: "/teacher", label: "내 일정", icon: Calendar },
    { href: "/teacher/students", label: "학생", icon: Users },
    { href: "/teacher/peek", label: "다른 선생님", icon: Eye },
  ],
  [Role.ADMIN]: [
    { href: "/admin", label: "대시보드", icon: LayoutDashboard },
    { href: "/admin/members", label: "회원", icon: Users },
    { href: "/admin/reservations", label: "예약", icon: ClipboardList },
  ],
};

/** 현재 경로에 가장 잘 맞는(가장 긴 href) 네비 항목의 href를 반환. 없으면 null. */
export function activeNavHref(items: NavItem[], pathname: string): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    const match = pathname === href || pathname.startsWith(href + "/");
    if (match && (best === null || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}
