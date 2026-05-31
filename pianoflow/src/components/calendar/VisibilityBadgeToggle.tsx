"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toggleReservationVisibilityAction } from "@/actions/reservations";

/** DaySchedule의 내 항목 옆에 붙는, 클릭으로 토글되는 공개/비공개 상태 뱃지 */
export function VisibilityBadgeToggle({
  reservationId,
  isPrivate: initialIsPrivate,
}: {
  reservationId: string;
  isPrivate: boolean;
}) {
  const [isPrivate, setIsPrivate] = useState(initialIsPrivate);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !isPrivate;
    setIsPrivate(next); // 낙관적 반영
    startTransition(async () => {
      const res = await toggleReservationVisibilityAction({
        reservationId,
        isPrivate: next,
      });
      if (res.ok) {
        toast.success(next ? "비공개로 변경했습니다." : "공개로 변경했습니다.");
      } else {
        setIsPrivate(!next); // 롤백
        toast.error(res.message);
      }
    });
  }

  return (
    <button type="button" onClick={toggle} disabled={pending} className="contents">
      <Badge
        variant={isPrivate ? "outline" : "secondary"}
        className={cn(
          "ml-1 cursor-pointer px-1.5 py-0 text-[10px]",
          pending && "opacity-60",
        )}
      >
        {isPrivate ? "비공개" : "공개"}
      </Badge>
    </button>
  );
}
