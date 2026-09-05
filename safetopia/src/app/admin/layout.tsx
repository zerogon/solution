import type { ReactNode } from "react";

import { requireActiveUser } from "@/lib/auth-helpers";
import { AppShell } from "@/components/app-shell/AppShell";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";
import { Role } from "@/generated/prisma/enums";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = await requireActiveUser();
  // proxy.ts의 authorized()가 이미 막지만, 토큰 기반이라 여기서 DB 값으로 한 번 더 본다.
  if (user.role !== Role.ADMIN) redirect("/");

  return (
    <>
      <AppShell role={Role.ADMIN} userName={user.name}>
        {children}
      </AppShell>
      <PwaInstallPrompt />
    </>
  );
}
