"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_BY_ROLE, activeNavHref } from "./nav-items";
import type { Role } from "@/generated/prisma/enums";

export function HeaderNav({
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
    <nav className="hidden items-center gap-1 text-sm md:flex">
      {items.map(({ href, label }) => {
        const active = href === activeHref;
        const count = badges?.[href] ?? 0;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative rounded-md px-2.5 py-1.5 font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {label}
            {count > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-mono text-[10px] leading-none font-semibold text-white tabular-nums">
                {count > 9 ? "9+" : count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
