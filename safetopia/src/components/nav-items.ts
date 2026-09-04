import {
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  Home,
  LayoutDashboard,
  Store,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Role } from "@/generated/prisma/enums";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * 앱 셸 내비게이션의 단일 출처. 사이드바(`AppSidebar`)와 모바일 하단 탭바
 * (`BottomTabBar`)가 같은 배열을 읽으므로 항목 추가는 여기 한 곳만 고치면 된다.
 *
 * 하단 탭바는 항목마다 `flex-1`이라 개수 비의존이지만 5칸이 편안한 상한이다 —
 * 390px에서 78px씩이고 아이콘 알약이 48px라 여유가 있다. 6칸부터가 위험선.
 * 직원 탭 4개는 PRD 7장 그대로. `/leave/history`는 대시보드·마이페이지에서 진입한다.
 */
export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  [Role.EMPLOYEE]: [
    { href: "/dashboard", label: "홈", icon: Home },
    { href: "/leave/request", label: "연차신청", icon: CalendarPlus },
    { href: "/calendar", label: "캘린더", icon: CalendarDays },
    { href: "/profile", label: "마이페이지", icon: UserRound },
  ],
  [Role.ADMIN]: [
    { href: "/admin/dashboard", label: "대시보드", icon: LayoutDashboard },
    { href: "/admin/employees", label: "직원", icon: Users },
    { href: "/admin/branches", label: "지점", icon: Store },
    { href: "/admin/leaves", label: "연차", icon: ClipboardList },
    { href: "/admin/calendar", label: "캘린더", icon: CalendarDays },
  ],
};

/**
 * 현재 경로에 해당하는 내비 항목의 href를 고른다.
 *
 * **최장 prefix 매칭**이라야 한다. 단순 `startsWith`로는 `/leave/request`에서
 * 상위 항목까지 같이 활성화되고, 완전 일치만 보면 하위 경로에서 아무것도 활성화되지 않는다.
 */
export function activeNavHref(items: NavItem[], pathname: string): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    const matches = pathname === href || pathname.startsWith(href + "/");
    if (!matches) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}
