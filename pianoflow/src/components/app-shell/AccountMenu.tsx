"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, KeyRound, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { logoutAction } from "@/actions/auth";
import { ROLE_LABEL } from "@/components/nav-items";
import { cn } from "@/lib/utils";
import type { Role } from "@/generated/prisma/enums";

/**
 * 사이드바 하단 계정 메뉴. 아바타 + 이름 + 역할을 보여주고, 클릭 시
 * 로그아웃 드롭다운을 연다. 접힘(rail) 모드에선 아바타만 표시.
 * 로그아웃은 서버 액션 logoutAction을 transition 안에서 호출한다.
 */
export function AccountMenu({
  userName,
  role,
  collapsed = false,
}: {
  userName: string;
  role: Role;
  collapsed?: boolean;
}) {
  const router = useRouter();
  const roleLabel = ROLE_LABEL[role] ?? "";
  const initial = userName.trim().charAt(0) || "?";
  const [, startTransition] = useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="계정 메뉴"
        className={cn(
          "flex w-full items-center rounded-md text-left text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-sidebar-ring data-popup-open:bg-sidebar-accent/60",
          collapsed ? "justify-center p-1.5" : "gap-2.5 p-2",
        )}
      >
        <Avatar size="sm">
          <AvatarFallback className="bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground">
            {initial}
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{userName}</span>
              <span className="truncate text-xs text-sidebar-foreground/60">
                {roleLabel}
              </span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-sidebar-foreground/50" />
          </>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align={collapsed ? "start" : "end"}
        sideOffset={8}
        className="w-56"
      >
        <div className="flex flex-col gap-0.5 px-1.5 py-1">
          <span className="truncate text-sm font-medium text-foreground">
            {userName}
          </span>
          <span className="text-xs text-muted-foreground">{roleLabel}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/account/password")}>
          <KeyRound />
          비밀번호 변경
        </DropdownMenuItem>
        <DropdownMenuItem
          variant="destructive"
          onClick={() => startTransition(() => logoutAction())}
        >
          <LogOut />
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
