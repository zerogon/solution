"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { cancelOwnPendingRequest } from "@/actions/leave-requests";
import { Button } from "@/components/ui/button";

export function CancelRequestButton({ id, size = "xs" }: { id: string; size?: "xs" | "sm" }) {
  const [pending, startTransition] = useTransition();

  function run() {
    if (!window.confirm("이 신청을 취소할까요?")) return;
    startTransition(async () => {
      const res = await cancelOwnPendingRequest({ id });
      if (res.ok) toast.success("신청을 취소했습니다.");
      else toast.error(res.message);
    });
  }

  return (
    <Button size={size} variant="outline" onClick={run} disabled={pending}>
      {pending ? "취소 중..." : "신청 취소"}
    </Button>
  );
}
