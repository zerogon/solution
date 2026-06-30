"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppSidebar } from "./AppSidebar";
import { BottomTabBar } from "@/components/BottomTabBar";
import { logoutAction } from "@/actions/auth";
import { cn } from "@/lib/utils";
import type { Role } from "@/generated/prisma/enums";

// 모바일 상단바용 가로형 로고. web-logo.png는 흰 배경 PNG라 mix-blend로 박스 제거.
function MobileLogo() {
  return (
    <Link
      href="/"
      aria-label="art'i Piano 홈"
      className="flex items-center transition-opacity hover:opacity-80"
    >
      <Image
        src="/web-logo.png"
        alt="art'i Piano"
        width={416}
        height={103}
        priority
        className="h-9 w-auto mix-blend-multiply"
      />
    </Link>
  );
}

function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Button type="submit" size="sm" variant="outline">
        로그아웃
      </Button>
    </form>
  );
}

/**
 * 역할 공통 앱 셸 (클라이언트). 데스크톱은 좌측 고정 사이드바(접기 가능),
 * 모바일은 슬림 상단바 + 하단 탭바. 서버 액션 logoutAction은 클라이언트
 * form에서 그대로 사용하고, children(서버 렌더 페이지)은 그대로 통과시킨다.
 */
export function AppShell({
  role,
  userName,
  badges,
  children,
}: {
  role: Role;
  userName: string;
  badges?: Record<string, number>;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-dvh">
      {/* 데스크톱 사이드바 */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden w-(--app-sidebar-w) flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 ease-in-out md:flex",
          collapsed ? "md:-translate-x-full" : "md:translate-x-0",
        )}
      >
        {/* 헤더: 가운데 정렬 로고(투명 PNG라 blend 불필요) + 접기 버튼 */}
        <div className="relative flex h-20 shrink-0 items-center justify-center px-3">
          <Link
            href="/"
            aria-label="art'i Piano 홈"
            className="flex items-center transition-opacity hover:opacity-80"
          >
            <Image
              src="/logo.png"
              alt="art'i Piano"
              width={935}
              height={419}
              priority
              className="h-auto w-32"
            />
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="사이드바 접기"
            className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <PanelLeftClose className="size-4.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <AppSidebar role={role} badges={badges} />
        </div>

        <div className="shrink-0 border-t border-sidebar-border p-3">
          <div className="flex items-center justify-between gap-2 pl-2">
            <span className="min-w-0 truncate text-sm font-medium">
              {userName}
            </span>
            <LogoutButton />
          </div>
        </div>
      </aside>

      {/* 접힘 상태에서 노출되는 펼치기 버튼 (데스크톱 전용) */}
      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="사이드바 펼치기"
          className="fixed top-3 left-3 z-40 hidden size-9 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground md:inline-flex"
        >
          <PanelLeftOpen className="size-4.5" />
        </button>
      )}

      {/* 모바일 상단바 */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur-md md:hidden">
        <MobileLogo />
        <div className="flex items-center gap-1.5">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {userName}
          </span>
          <LogoutButton />
        </div>
      </header>

      {/* 콘텐츠 — 데스크톱에선 사이드바 폭만큼 좌측 패딩(접힘 시 0) */}
      <div
        className={cn(
          "flex min-h-dvh flex-col transition-[padding] duration-200 ease-in-out",
          collapsed ? "md:pl-0" : "md:pl-(--app-sidebar-w)",
        )}
      >
        <main className="mx-auto w-full max-w-(--app-content-w) flex-1 px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">
          {children}
        </main>
      </div>

      {/* 모바일 하단 탭바 */}
      <BottomTabBar role={role} badges={badges} />
    </div>
  );
}
