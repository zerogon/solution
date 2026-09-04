"use client";

import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import { AppSidebar } from "./AppSidebar";
import { AccountMenu } from "./AccountMenu";
import { BottomTabBar } from "@/components/BottomTabBar";
import { AppMark } from "@/components/app-mark";
import { Button } from "@/components/ui/button";
import { NAV_BY_ROLE } from "@/components/nav-items";
import type { Role } from "@/generated/prisma/enums";

const APP_NAME = "Safetopia";
const COLLAPSE_KEY = "safetopia:sidebar-collapsed";
const COLLAPSE_EVENT = "safetopia:sidebar";

/**
 * 사이드바 접힘 상태를 localStorage에 보존한다.
 *
 * `useState` + `useEffect`로 읽으면 첫 페인트가 항상 "펼침"이라 새로고침마다
 * 사이드바가 덜컥 움직인다. `useSyncExternalStore`로 서버 스냅샷을 false로 고정하면
 * hydration 불일치 없이 클라이언트 값이 곧바로 반영된다.
 */
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSE_EVENT, onChange);
  };
}

function useSidebarCollapsed(): [boolean, () => void] {
  const collapsed = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(COLLAPSE_KEY) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );

  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
    } catch {
      // 시크릿 모드 등에서 저장이 막혀도 토글 자체는 동작해야 한다.
    }
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  }, [collapsed]);

  return [collapsed, toggle];
}

export function AppShell({
  role,
  userName,
  badges,
  children,
}: {
  /** 어느 영역의 내비를 그릴지. 관리자가 직원 화면을 볼 때는 EMPLOYEE를 넘긴다. */
  role: Role;
  userName: string;
  /** href → 미처리 건수. 사이드바·탭바 배지. */
  badges?: Record<string, number>;
  children: ReactNode;
}) {
  const [collapsed, toggle] = useSidebarCollapsed();
  const items = NAV_BY_ROLE[role];

  return (
    <div className="min-h-dvh">
      {/* 데스크톱 사이드바 — md 미만에서는 숨기고 하단 탭바가 대신한다. */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-in-out md:flex",
          collapsed ? "md:w-(--app-sidebar-rail-w)" : "md:w-(--app-sidebar-w)",
        )}
      >
        <div
          className={cn(
            "relative flex h-16 shrink-0 items-center border-b border-sidebar-border",
            collapsed ? "justify-center px-0" : "px-3",
          )}
        >
          {collapsed ? (
            <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="사이드바 펼치기">
              <PanelLeftOpen className="size-4" />
            </Button>
          ) : (
            <>
              <AppMark className="size-8" />
              <span className="ml-2 font-heading text-sm font-semibold tracking-tight">
                {APP_NAME}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={toggle}
                aria-label="사이드바 접기"
                className="absolute right-2"
              >
                <PanelLeftClose className="size-4" />
              </Button>
            </>
          )}
        </div>

        <AppSidebar items={items} badges={badges} collapsed={collapsed} />

        <div className="shrink-0 border-t border-sidebar-border p-2">
          <AccountMenu userName={userName} role={role} collapsed={collapsed} />
        </div>
      </aside>

      {/* 모바일 상단바 */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-background/80 px-4 py-2.5 backdrop-blur-md md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <AppMark className="size-7" />
          <span className="font-heading text-sm font-semibold tracking-tight">{APP_NAME}</span>
        </div>
        {/* 모바일에는 사이드바가 없으므로 계정 메뉴(=로그아웃)를 여기로 끌어온다. */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="max-w-[8rem] truncate text-xs text-muted-foreground">{userName}</span>
          <div className="w-auto">
            <AccountMenu userName={userName} role={role} collapsed />
          </div>
        </div>
      </header>

      <div
        className={cn(
          "flex min-h-dvh flex-col transition-[padding] duration-200 ease-in-out",
          collapsed ? "md:pl-(--app-sidebar-rail-w)" : "md:pl-(--app-sidebar-w)",
        )}
      >
        {/* pb-24: 모바일에서 하단 탭바에 콘텐츠 마지막 줄이 가리지 않도록. */}
        <main className="mx-auto w-full max-w-(--app-content-w) flex-1 px-4 py-6 pb-24 md:px-6 md:py-8 md:pb-8 xl:px-8">
          {children}
        </main>
      </div>

      <BottomTabBar items={items} badges={badges} />
    </div>
  );
}
