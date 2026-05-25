"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelReservationAction } from "@/actions/reservations";

export function CancelButton({ reservationId }: { reservationId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await cancelReservationAction({ reservationId });
          if (res.ok) toast.success("예약이 취소되었습니다.");
          else toast.error(res.message);
        })
      }
    >
      {pending ? "취소 중..." : "취소"}
    </Button>
  );
}
