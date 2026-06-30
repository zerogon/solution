"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_BY_ROLE, activeNavHref } from "./nav-items";
import { NavBadge } from "./nav-badge";
import type { Role } from "@/generated/prisma/enums";

export function BottomTabBar({
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
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-3xl pb-[env(safe-area-inset-bottom)]">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === activeHref;
          const count = badges?.[href] ?? 0;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    active && "bg-primary/10",
                  )}
                >
                  <Icon className="size-5" strokeWidth={active ? 2.4 : 2} />
                  <NavBadge count={count} className="absolute top-0 right-2" />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
