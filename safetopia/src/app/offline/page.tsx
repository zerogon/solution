import type { Metadata } from "next";

import { AppMark } from "@/components/app-mark";
import { OfflineRetryButton } from "./OfflineRetryButton";

export const metadata: Metadata = {
  title: "오프라인 · Safetopia",
};

/**
 * 서비스워커가 네트워크 실패 시 돌려주는 폴백 화면.
 *
 * 이 페이지는 `install` 단계에서 precache되므로 **인증이 필요 없어야 하고**
 * (auth.config.ts의 `isPublic`, proxy.ts matcher에서 제외) 서버 데이터에
 * 의존해서도 안 된다.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <AppMark className="size-14 opacity-60" />
      <div className="space-y-1.5">
        <h1 className="font-heading text-xl font-semibold tracking-tight">
          연결이 끊겼습니다
        </h1>
        <p className="max-w-xs text-sm text-muted-foreground">
          네트워크에 연결되면 연차 현황을 다시 볼 수 있습니다. 신청 내용은
          연결 복구 후 다시 시도해 주세요.
        </p>
      </div>
      <OfflineRetryButton />
    </div>
  );
}
