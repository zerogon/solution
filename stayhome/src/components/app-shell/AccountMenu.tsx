"use client";

import { ChevronsUpDown, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { clearServiceWorkerCaches } from "@/lib/sw-client";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AccountMenu({
  email,
  signOutAction,
  collapsed,
}: {
  email: string;
  /** 서버 액션. 상위 서버 컴포넌트에서 `signOut()`을 감싸 넘긴다. */
  signOutAction: () => Promise<void>;
  collapsed: boolean;
}) {
  const initial = email.trim().charAt(0).toUpperCase() || "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-sidebar-accent/60 data-popup-open:bg-sidebar-accent",
          collapsed && "justify-center",
        )}
        title={collapsed ? email : undefined}
      >
        <Avatar size="sm" className="shrink-0">
          <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">
            {initial}
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-sidebar-foreground/80">
              {email}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <form
          action={signOutAction}
          // 로그아웃하면서 서비스워커가 들고 있는 조회 캐시도 함께 비운다.
          // 안 그러면 다음 사용자가 이전 세션의 조회 결과를 그대로 보게 된다.
          onSubmit={() => {
            void clearServiceWorkerCaches();
          }}
        >
          {/* Base UI의 Menu.Item은 기본이 <div>라서 `nativeButton`이 false다. 여기서는
              서버 액션 form을 제출해야 해 진짜 <button type="submit">을 넘기므로,
              네이티브 버튼임을 알려 role/aria-disabled 같은 중복 속성이 붙지 않게 한다. */}
          <DropdownMenuItem
            variant="destructive"
            nativeButton
            render={<button type="submit" className="w-full" />}
          >
            <LogOut />
            로그아웃
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
