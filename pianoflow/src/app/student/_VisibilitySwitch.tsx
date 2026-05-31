"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { toggleReservationVisibilityAction } from "@/actions/reservations";

export function VisibilitySwitch({
  reservationId,
  isPrivate: initialIsPrivate,
}: {
  reservationId: string;
  isPrivate: boolean;
}) {
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate);
  const [pending, startTransition] = useTransition();

  // 스위치 켜짐 = 공개
  function onChange(checked: boolean) {
    const nextPrivate = !checked;
    setIsPrivate(nextPrivate); // 낙관적 반영
    startTransition(async () => {
      const res = await toggleReservationVisibilityAction({
        reservationId,
        isPrivate: nextPrivate,
      });
      if (res.ok) {
        toast.success(nextPrivate ? "비공개로 변경했습니다." : "공개로 변경했습니다.");
      } else {
        setIsPrivate(!nextPrivate); // 롤백
        toast.error(res.message);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className={
          isPrivate
            ? "text-xs text-muted-foreground"
            : "text-xs font-medium text-foreground"
        }
      >
        {isPrivate ? "비공개" : "공개"}
      </span>
      <Switch
        checked={!isPrivate}
        onCheckedChange={onChange}
        disabled={pending}
        aria-label="레슨 일정 공개 여부"
      />
    </div>
  );
}
