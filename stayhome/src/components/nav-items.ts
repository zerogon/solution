import {
  CalendarSearch,
  KeyRound,
  MapPin,
  ScrollText,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * 앱 셸 내비게이션의 단일 출처. 사이드바(`AppSidebar`)와 모바일 하단 탭바
 * (`BottomTabBar`)가 같은 배열을 읽으므로 항목 추가는 여기 한 곳만 고치면 된다.
 *
 * stayhome은 복지 담당자 1인용이라 역할 분기가 없다 — pianoflow의 `NAV_BY_ROLE`
 * 테이블 대신 평평한 배열 하나면 충분하다.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "조회", icon: CalendarSearch },
  { href: "/admin/accounts", label: "계정", icon: KeyRound },
  { href: "/admin/properties", label: "지점", icon: MapPin },
  // 하단 탭바(`BottomTabBar`)는 항목마다 `flex-1`이라 개수 비의존이다 — 5칸이면
  // 390px에서 78px씩이고 아이콘 알약이 48px라 여유가 있다. 6칸부터가 위험선.
  { href: "/admin/rates", label: "요금", icon: Wallet },
  { href: "/admin/crawl-logs", label: "로그", icon: ScrollText },
];

/**
 * 현재 경로에 해당하는 내비 항목의 href를 고른다.
 *
 * **최장 prefix 매칭**이라야 한다. 단순 `startsWith`로는 `/admin/accounts`에서
 * `/`(조회)까지 같이 활성화되고, 반대로 완전 일치만 보면 하위 경로에서 아무것도
 * 활성화되지 않는다.
 */
export function activeNavHref(items: NavItem[], pathname: string): string | null {
  let best: string | null = null;
  for (const { href } of items) {
    const matches = href === "/" ? pathname === "/" : pathname.startsWith(href);
    if (!matches) continue;
    if (best === null || href.length > best.length) best = href;
  }
  return best;
}
