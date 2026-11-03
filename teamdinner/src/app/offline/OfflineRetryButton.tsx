"use client";

import { Button } from "@/components/ui/button";

export function OfflineRetryButton() {
  return (
    <Button variant="outline" onClick={() => window.location.reload()}>
      다시 시도
    </Button>
  );
}
