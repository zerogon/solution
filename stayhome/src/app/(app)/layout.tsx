import type { ReactNode } from "react";

import { requireSession } from "@/lib/auth-helpers";
import { signOut } from "@/auth";
import { AppShell } from "@/components/app-shell/AppShell";

/**
 * 인증이 필요한 화면 전체의 셸.
 *
 * `(app)`은 URL에 나타나지 않는 라우트 그룹이라 `/`, `/admin/*` 경로는 그대로다.
 * `/login`과 `/offline`은 이 그룹 밖에 있으므로 셸 없이 렌더된다.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <AppShell email={session.user.email ?? ""} signOutAction={signOutAction}>
      {children}
    </AppShell>
  );
}
