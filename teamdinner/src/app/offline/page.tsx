import type { Metadata } from "next";

import { AppMark } from "@/components/app-mark";
import { OfflineRetryButton } from "./OfflineRetryButton";

export const metadata: Metadata = { title: "오프라인" };

/** 서비스워커가 네트워크 실패 시 돌려주는 폴백 화면. install 단계에서 precache 된다. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <AppMark className="size-14 opacity-60" />
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">연결이 끊겼습니다</h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          네트워크에 연결되면 장바구니를 다시 불러올 수 있습니다.
        </p>
      </div>
      <OfflineRetryButton />
    </main>
  );
}
