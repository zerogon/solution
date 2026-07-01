"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_BY_ROLE, activeNavHref } from "@/components/nav-items";
import { NavBadge } from "@/components/nav-badge";
import type { Role } from "@/generated/prisma/enums";

/**
 * 데스크톱 사이드바 네비게이션. usePathname이 필요한 유일한 클라이언트 섬.
 * 세션·로그아웃은 서버 AppShell이 소유한다.
 * collapsed(레일) 모드에선 아이콘만 중앙 정렬하고 라벨은 sr-only + title 툴팁.
 */
export function AppSidebar({
  role,
  badges,
  collapsed = false,
}: {
  role: Role;
  badges?: Record<string, number>;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const items = NAV_BY_ROLE[role] ?? [];
  const activeHref = activeNavHref(items, pathname);

  return (
    <nav className={cn("flex flex-col gap-0.5 py-3", collapsed ? "px-2" : "px-3")}>
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === activeHref;
        const count = badges?.[href] ?? 0;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            title={collapsed ? label : undefined}
            className={cn(
              "relative flex items-center rounded-md text-sm font-medium transition-colors",
              // 활성 좌측 인디고 액센트 바 (펼침 모드에서만; 레일에선 아이콘 칩으로 대체)
              !collapsed &&
                active &&
                "before:absolute before:top-1/2 before:left-0 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-sidebar-primary",
              collapsed ? "justify-center p-2" : "gap-3 px-3 py-2",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            )}
          >
            <span className="relative flex shrink-0 items-center justify-center">
              <Icon className="size-4.5" strokeWidth={active ? 2.3 : 2} />
              {/* 레일 모드: 숫자 대신 미읽음 점만 아이콘 우상단에 표시 */}
              {collapsed && count > 0 && (
                <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-destructive ring-2 ring-sidebar" />
              )}
            </span>
            {collapsed ? (
              <span className="sr-only">{label}</span>
            ) : (
              <>
                <span className="flex-1 truncate">{label}</span>
                <NavBadge count={count} />
              </>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
