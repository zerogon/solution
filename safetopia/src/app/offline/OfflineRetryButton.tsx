"use client";

import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * `location.reload()`만 하는 버튼. `/offline`은 서비스워커가 precache하는
 * 정적 페이지라야 하므로 상호작용은 이 작은 클라이언트 컴포넌트로만 격리한다.
 */
export function OfflineRetryButton() {
  return (
    <Button variant="outline" onClick={() => window.location.reload()}>
      <RefreshCw className="size-4" />
      다시 시도
    </Button>
  );
}
