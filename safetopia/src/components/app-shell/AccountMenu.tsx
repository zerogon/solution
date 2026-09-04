"use client";

import Link from "next/link";
import { ChevronsUpDown, KeyRound, LogOut, ScrollText } from "lucide-react";

import { cn } from "@/lib/utils";
import { clearServiceWorkerCaches } from "@/lib/sw-client";
import { logoutAction } from "@/actions/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Role } from "@/generated/prisma/enums";
import { ROLE_LABEL } from "@/lib/labels";

export function AccountMenu({
  userName,
  role,
  collapsed,
}: {
  userName: string;
  role: Role;
  collapsed: boolean;
}) {
  const initial = userName.trim().charAt(0) || "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2 rounded-md p-2 text-left text-sm transition-colors hover:bg-sidebar-accent/60 data-popup-open:bg-sidebar-accent",
          collapsed && "justify-center",
        )}
        title={collapsed ? userName : undefined}
      >
        <Avatar size="sm" className="shrink-0">
          <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground">
            {initial}
          </AvatarFallback>
        </Avatar>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sidebar-foreground/90">{userName}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {ROLE_LABEL[role]}
              </span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        {/* base-nova는 asChild 대신 render prop. */}
        <DropdownMenuItem render={<Link href="/account/password" />}>
          <KeyRound />
          비밀번호 변경
        </DropdownMenuItem>
        {role === Role.ADMIN && (
          <DropdownMenuItem render={<Link href="/admin/audit-logs" />}>
            <ScrollText />
            감사 로그
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <form
          action={logoutAction}
          // 로그아웃하면서 서비스워커의 런타임 캐시도 비운다 — 다음 사용자가
          // 이전 세션의 응답을 먼저 보는 일을 막는다.
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
