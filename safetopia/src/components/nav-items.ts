import { CalendarDays, Home, NotebookPen, Settings, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * 앱 셸 내비게이션의 단일 출처. 사이드바(`AppSidebar`)와 모바일 하단 탭바
 * (`BottomTabBar`)가 같은 배열을 읽으므로 항목 추가는 여기 한 곳만 고치면 된다.
 *
 * 하단 탭바는 항목마다 `flex-1`이라 5칸이 편안한 상한이다(390px에서 78px씩).
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "홈", icon: Home },
  { href: "/leaves", label: "연차 기록", icon: NotebookPen },
  { href: "/calendar", label: "캘린더", icon: CalendarDays },
  { href: "/settings", label: "설정", icon: Settings },
];

/**
 * 현재 경로에 해당하는 내비 항목의 href를 고른다.
 *
 * **최장 prefix 매칭**이라야 한다. 단순 `startsWith`로는 하위 경로에서 상위 항목까지
 * 같이 활성화되고, 완전 일치만 보면 `/leaves/new`에서 아무것도 활성화되지 않는다.
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
