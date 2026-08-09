import type { ReactNode } from "react";

import { requireSession } from "@/lib/auth-helpers";
import { signOut } from "@/auth";
import { AppShell } from "@/components/app-shell/AppShell";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";

/**
 * 인증이 필요한 화면 전체의 셸.
 *
 * `(app)`은 URL에 나타나지 않는 라우트 그룹이라 `/`, `/admin/*` 경로는 그대로다.
 * `/login`과 `/offline`은 이 그룹 밖에 있으므로 셸 없이 렌더된다.
 *
 * `PwaInstallPrompt`는 루트 레이아웃이 아니라 **여기** 있어야 한다. 설치 시트는
 * Base UI 모달이라 열리는 순간 `markOthers()`가 바깥 형제 요소에
 * `aria-hidden="true"` / `data-base-ui-inert=""`를 DOM에 직접 찍는다. `/login`은
 * `useSearchParams` 때문에 본문이 `<Suspense>` 안에 있어 그 경계가 늦게 하이드레이트되는데,
 * 그 사이에 시트가 열리면 React가 자기가 렌더하지 않은 속성을 DOM에서 발견해
 * hydration mismatch를 낸다. 로그인 전에 설치를 권하는 것도 어차피 이르다.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();

  async function signOutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <>
      <AppShell email={session.user.email ?? ""} signOutAction={signOutAction}>
        {children}
      </AppShell>
      <PwaInstallPrompt />
    </>
  );
}
