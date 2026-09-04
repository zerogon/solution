"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { activeNavHref, type NavItem } from "@/components/nav-items";
import { NavBadge } from "@/components/nav-badge";

/**
 * 모바일 하단 탭바. 매니페스트가 `display: standalone`을 선언하는 설치형 앱이라
 * 폰에서는 사이드바 대신 이쪽이 주 내비게이션이 된다.
 */
export function BottomTabBar({
  items,
  badges,
}: {
  items: NavItem[];
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const active = activeNavHref(items, pathname);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
      {/* 홈 인디케이터가 있는 기기에서 탭이 가리지 않도록 safe-area만큼 띄운다. */}
      <ul className="mx-auto flex max-w-md pb-[env(safe-area-inset-bottom)]">
        {items.map(({ href, label, icon: Icon }) => {
          const isActive = href === active;
          const count = badges?.[href] ?? 0;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[11px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "relative flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    isActive && "bg-primary/10",
                  )}
                >
                  <Icon className="size-5" strokeWidth={isActive ? 2.4 : 2} />
                  {count > 0 && (
                    <span className="absolute -top-0.5 right-1">
                      <NavBadge count={count} />
                    </span>
                  )}
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
