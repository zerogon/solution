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
 */
export function AppSidebar({
  role,
  badges,
}: {
  role: Role;
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const items = NAV_BY_ROLE[role] ?? [];
  const activeHref = activeNavHref(items, pathname);

  return (
    <nav className="flex flex-col gap-0.5 px-3 py-3">
      {items.map(({ href, label, icon: Icon }) => {
        const active = href === activeHref;
        const count = badges?.[href] ?? 0;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            )}
          >
            <Icon
              className="size-4.5 shrink-0"
              strokeWidth={active ? 2.3 : 2}
            />
            <span className="flex-1 truncate">{label}</span>
            <NavBadge count={count} />
          </Link>
        );
      })}
    </nav>
  );
}
