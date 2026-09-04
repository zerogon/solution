"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { activeNavHref, type NavItem } from "@/components/nav-items";
import { NavBadge } from "@/components/nav-badge";

export function AppSidebar({
  items,
  badges,
  collapsed,
}: {
  items: NavItem[];
  badges?: Record<string, number>;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const active = activeNavHref(items, pathname);

  return (
    <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
      <ul className="space-y-1">
        {items.map(({ href, label, icon: Icon }) => {
          const isActive = href === active;
          const count = badges?.[href] ?? 0;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                title={collapsed ? label : undefined}
                className={cn(
                  "relative flex items-center rounded-md text-sm font-medium transition-colors",
                  collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-2.5 py-2",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:left-0 before:h-5 before:w-0.5 before:rounded-full before:bg-sidebar-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                {/* 색만이 아니라 획 두께로도 활성 상태를 표시한다. */}
                <Icon className="size-4.5 shrink-0" strokeWidth={isActive ? 2.3 : 2} />
                <span className={cn("flex-1", collapsed && "sr-only")}>{label}</span>
                {count > 0 &&
                  (collapsed ? (
                    // 레일 모드에서는 숫자를 그릴 자리가 없으니 점으로 줄인다.
                    <span className="absolute top-1.5 right-2 size-2 rounded-full bg-destructive" />
                  ) : (
                    <NavBadge count={count} />
                  ))}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
