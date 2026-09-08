import type { ReactNode } from "react";

import { requireActiveUser } from "@/lib/auth-helpers";
import { AppShell } from "@/components/app-shell/AppShell";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";
import { Role } from "@/generated/prisma/enums";

/**
 * 직원 화면 셸. `(employee)`는 URL에 나타나지 않는 라우트 그룹이라
 * `/dashboard`, `/leave/*`, `/calendar`, `/profile` 경로는 그대로다.
 *
 * 관리자도 이 그룹에 들어올 수 있다(본인 연차 신청). 그때도 내비는 직원용을 그린다 —
 * 관리자 메뉴는 `/admin/*`에서.
 *
 * `PwaInstallPrompt`는 루트 레이아웃에 두지 않는다. 설치 시트는 Base UI 모달이라
 * 열리는 순간 `markOthers()`가 바깥 형제 요소에 `aria-hidden`을 DOM에 직접 찍는데,
 * `/login`은 `useSearchParams` 때문에 `<Suspense>` 경계가 늦게 하이드레이트되어 그
 * 사이에 시트가 열리면 hydration mismatch가 난다. 그래서 `/login`은 그 경계 **안**에서
 * 따로 마운트하고(`login/page.tsx`), 셸에는 여기와 `admin/layout.tsx`에 둔다 —
 * 로그인 유지 상태로 바로 들어온 사용자를 위해서다. 세션 1회 가드가 중복을 막는다.
 */
export default async function EmployeeLayout({ children }: { children: ReactNode }) {
  const { user } = await requireActiveUser();

  return (
    <>
      <AppShell role={Role.EMPLOYEE} userName={user.name}>
        {children}
      </AppShell>
      <PwaInstallPrompt />
    </>
  );
}
