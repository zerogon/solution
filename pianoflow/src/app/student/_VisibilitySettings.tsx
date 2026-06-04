"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  bulkSetReservationVisibilityAction,
  toggleReservationVisibilityAction,
} from "@/actions/reservations";

type Item = {
  id: string;
  label: string;
  teacherName: string;
  isPrivate: boolean;
};

export function VisibilitySettings({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [pending, startTransition] = useTransition();

  // 스위치 켜짐 = 공개. 모두 공개일 때만 전체 스위치 ON
  const allPublic = items.length > 0 && items.every((i) => !i.isPrivate);

  function setAll(nextPrivate: boolean) {
    const prev = items;
    setItems((cur) => cur.map((i) => ({ ...i, isPrivate: nextPrivate }))); // 낙관적 반영
    startTransition(async () => {
      const res = await bulkSetReservationVisibilityAction({
        isPrivate: nextPrivate,
      });
      if (res.ok) {
        toast.success(
          nextPrivate
            ? "모든 레슨을 비공개로 변경했습니다."
            : "모든 레슨을 공개로 변경했습니다.",
        );
      } else {
        setItems(prev); // 롤백
        toast.error(res.message);
      }
    });
  }

  function toggleOne(id: string, nextPrivate: boolean) {
    const prev = items;
    setItems((cur) =>
      cur.map((i) => (i.id === id ? { ...i, isPrivate: nextPrivate } : i)),
    ); // 낙관적 반영
    startTransition(async () => {
      const res = await toggleReservationVisibilityAction({
        reservationId: id,
        isPrivate: nextPrivate,
      });
      if (res.ok) {
        toast.success(nextPrivate ? "비공개로 변경했습니다." : "공개로 변경했습니다.");
      } else {
        setItems(prev); // 롤백
        toast.error(res.message);
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* 전체 공개/비공개 */}
      <div className="flex items-center justify-between gap-3 rounded-md bg-muted/50 px-3 py-2.5">
        <span className="text-sm font-medium">전체 공개 설정</span>
        <div className="flex items-center gap-2">
          <span
            className={
              allPublic
                ? "text-xs font-medium text-foreground"
                : "text-xs text-muted-foreground"
            }
          >
            {allPublic ? "전체 공개" : "전체 비공개"}
          </span>
          <Switch
            checked={allPublic}
            onCheckedChange={(checked) => setAll(!checked)}
            disabled={pending || items.length === 0}
            aria-label="전체 레슨 일정 공개 여부"
          />
        </div>
      </div>

      {/* 개별 공개/비공개 */}
      <div className="space-y-2">
        {items.map((i) => (
          <div
            key={i.id}
            className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5"
          >
            <div>
              <div className="text-sm tabular-nums">{i.label}</div>
              <div className="text-xs text-muted-foreground">
                {i.teacherName} 선생님
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={
                  i.isPrivate
                    ? "text-xs text-muted-foreground"
                    : "text-xs font-medium text-foreground"
                }
              >
                {i.isPrivate ? "비공개" : "공개"}
              </span>
              <Switch
                checked={!i.isPrivate}
                onCheckedChange={(checked) => toggleOne(i.id, !checked)}
                disabled={pending}
                aria-label="레슨 일정 공개 여부"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
