"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_BY_ROLE, activeNavHref } from "./nav-items";
import type { Role } from "@/generated/prisma/enums";

export function HeaderNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = NAV_BY_ROLE[role] ?? [];
  const activeHref = activeNavHref(items, pathname);

  return (
    <nav className="hidden items-center gap-1 text-sm md:flex">
      {items.map(({ href, label }) => {
        const active = href === activeHref;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1.5 font-medium transition-colors",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
