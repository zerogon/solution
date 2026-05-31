"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Weekday } from "@/generated/prisma/enums";
import { adminSetTeacherAvailability } from "@/actions/availability";
import { SLOT_HOURS } from "@/lib/slots";

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

type HoursByWeekday = Record<Weekday, Set<number>>;

function buildInitial(initial: { weekday: Weekday; hours: number[] }[]): HoursByWeekday {
  const map = {} as HoursByWeekday;
  for (const w of ALL_WEEKDAYS) map[w] = new Set<number>();
  for (const e of initial) map[e.weekday] = new Set(e.hours);
  return map;
}

export function AvailabilityForm({
  teacherId,
  initial,
}: {
  teacherId: string;
  initial: { weekday: Weekday; hours: number[] }[];
}) {
  const [hours, setHours] = useState<HoursByWeekday>(() => buildInitial(initial));
  const [pending, startTransition] = useTransition();

  function toggleHour(w: Weekday, h: number) {
    setHours((prev) => {
      const next = { ...prev, [w]: new Set(prev[w]) };
      if (next[w].has(h)) next[w].delete(h);
      else next[w].add(h);
      return next;
    });
  }

  function setAll(w: Weekday, on: boolean) {
    setHours((prev) => ({
      ...prev,
      [w]: on ? new Set<number>(SLOT_HOURS) : new Set<number>(),
    }));
  }

  function save() {
    const entries = ALL_WEEKDAYS.filter((w) => hours[w].size > 0).map((w) => ({
      weekday: w,
      hours: Array.from(hours[w]).sort((a, b) => a - b),
    }));
    startTransition(async () => {
      const res = await adminSetTeacherAvailability({ teacherId, entries });
      if (res.ok) toast.success("저장되었습니다.");
      else toast.error(res.message);
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        요일별로 예약 가능한 시간을 선택하세요. 시간을 하나도 선택하지 않은 요일은
        예약 불가로 처리됩니다.
      </p>

      <div className="space-y-4">
        {ALL_WEEKDAYS.map((w) => {
          const set = hours[w];
          const allOn = set.size === SLOT_HOURS.length;
          return (
            <div key={w} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold">
                  {KOREAN[w]}요일
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {set.size > 0 ? `${set.size}개 시간` : "휴무"}
                  </span>
                </span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setAll(w, !allOn)}
                  >
                    {allOn ? "전체 해제" : "전체 선택"}
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {SLOT_HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => toggleHour(w, h)}
                    className="contents"
                  >
                    <Badge
                      variant={set.has(h) ? "default" : "outline"}
                      className="cursor-pointer px-2.5 py-1 text-sm"
                    >
                      {String(h).padStart(2, "0")}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Button onClick={save} disabled={pending}>
        {pending ? "저장 중..." : "저장"}
      </Button>
    </div>
  );
}
