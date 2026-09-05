"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { cancelOwnLeaveRequest } from "@/actions/leave-requests";
import { Button } from "@/components/ui/button";

export function CancelRequestButton({ id, size = "xs" }: { id: string; size?: "xs" | "sm" }) {
  const [pending, startTransition] = useTransition();

  function run() {
    if (!window.confirm("이 연차를 취소할까요? 차감된 연차가 복원됩니다.")) return;
    startTransition(async () => {
      const res = await cancelOwnLeaveRequest({ id });
      if (res.ok) toast.success("연차를 취소하고 잔여를 복원했습니다.");
      else toast.error(res.message);
    });
  }

  return (
    <Button size={size} variant="outline" onClick={run} disabled={pending}>
      {pending ? "취소 중..." : "신청 취소"}
    </Button>
  );
}
