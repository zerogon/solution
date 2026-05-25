"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Weekday } from "@/generated/prisma/enums";
import { adminSetTeacherAvailability } from "@/actions/availability";

const ALL_WEEKDAYS: Weekday[] = [
  Weekday.MON,
  Weekday.TUE,
  Weekday.WED,
  Weekday.THU,
  Weekday.FRI,
  Weekday.SAT,
  Weekday.SUN,
];

const KOREAN: Record<Weekday, string> = {
  MON: "월",
  TUE: "화",
  WED: "수",
  THU: "목",
  FRI: "금",
  SAT: "토",
  SUN: "일",
};

export function AvailabilityForm({
  teacherId,
  initial,
}: {
  teacherId: string;
  initial: Weekday[];
}) {
  const [selected, setSelected] = useState<Set<Weekday>>(new Set(initial));
  const [pending, startTransition] = useTransition();

  function toggle(w: Weekday) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(w)) next.delete(w);
      else next.add(w);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const res = await adminSetTeacherAvailability({
        teacherId,
        weekdays: Array.from(selected),
      });
      if (res.ok) toast.success("저장되었습니다.");
      else toast.error(res.message);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {ALL_WEEKDAYS.map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => toggle(w)}
            className="contents"
          >
            <Badge
              variant={selected.has(w) ? "default" : "outline"}
              className="cursor-pointer text-base px-4 py-1.5"
            >
              {KOREAN[w]}
            </Badge>
          </button>
        ))}
      </div>
      <Button onClick={save} disabled={pending}>
        {pending ? "저장 중..." : "저장"}
      </Button>
    </div>
  );
}
