"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Weekday } from "@/generated/prisma/enums";
import {
  adminClearTeacherScheduleException,
  adminSetTeacherScheduleException,
} from "@/actions/availability";
import { SLOT_HOURS, parseKstDate, weekdayOf } from "@/lib/slots";

const KOREAN: Record<Weekday, string> = {
  MON: "월",
  TUE: "화",
  WED: "수",
  THU: "목",
  FRI: "금",
  SAT: "토",
  SUN: "일",
};

interface WeeklyEntry {
  weekday: Weekday;
  hours: number[];
}
interface ExceptionEntry {
  date: string; // YYYY-MM-DD
  hours: number[];
}

/** YYYY-MM-DD → "07.17 (금)" */
function labelOf(dateStr: string): string {
  const weekday = weekdayOf(parseKstDate(dateStr));
  return `${dateStr.slice(5).replace("-", ".")} (${KOREAN[weekday]})`;
}

export function ScheduleExceptionSection({
  teacherId,
  weekly,
  exceptions,
  minDate,
  maxDate,
}: {
  teacherId: string;
  weekly: WeeklyEntry[];
  exceptions: ExceptionEntry[];
  minDate: string;
  maxDate: string;
}) {
  const weeklyMap = useMemo(
    () => new Map(weekly.map((w) => [w.weekday, w.hours])),
    [weekly],
  );
  const exceptionByDate = useMemo(
    () => new Map(exceptions.map((e) => [e.date, e.hours])),
    [exceptions],
  );

  // 특정 날짜의 초기 시간: 예외가 있으면 예외, 없으면 요일 기본값.
  const hoursFor = (dateStr: string): number[] => {
    const exc = exceptionByDate.get(dateStr);
    if (exc) return exc;
    return weeklyMap.get(weekdayOf(parseKstDate(dateStr))) ?? [];
  };

  const [date, setDate] = useState(minDate);
  const [hours, setHours] = useState<Set<number>>(() => new Set(hoursFor(minDate)));
  const [pending, startTransition] = useTransition();

  function pickDate(next: string) {
    setDate(next);
    setHours(new Set(hoursFor(next)));
  }

  function toggleHour(h: number) {
    setHours((prev) => {
      const next = new Set(prev);
      if (next.has(h)) next.delete(h);
      else next.add(h);
      return next;
    });
  }

  const allOn = hours.size === SLOT_HOURS.length;
  const hasException = exceptionByDate.has(date);

  function save() {
    const payload = Array.from(hours).sort((a, b) => a - b);
    startTransition(async () => {
      const res = await adminSetTeacherScheduleException({
        teacherId,
        date,
        hours: payload,
      });
      if (res.ok)
        toast.success(
          payload.length === 0
            ? "휴무로 지정되었습니다."
            : "날짜 예외가 저장되었습니다.",
        );
      else toast.error(res.message);
    });
  }

  function clearFor(target: string) {
    startTransition(async () => {
      const res = await adminClearTeacherScheduleException({
        teacherId,
        date: target,
      });
      if (res.ok) {
        toast.success("예외가 삭제되어 요일 기본값으로 복귀했습니다.");
        if (target === date) setHours(new Set(hoursFor(target)));
      } else toast.error(res.message);
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        특정 날짜만 요일 기본 스케줄과 다르게 운영할 때 사용합니다. 이 설정은 해당
        날짜에만 적용되며 다음 주 같은 요일에는 영향을 주지 않습니다. 시간을 모두
        해제하고 저장하면 그날은 <b>휴무</b>로 처리됩니다.
      </p>

      <div className="space-y-3 rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            날짜
            <input
              type="date"
              value={date}
              min={minDate}
              max={maxDate}
              onChange={(e) => e.target.value && pickDate(e.target.value)}
              className="rounded-md border bg-transparent px-2 py-1 text-sm"
            />
            <span className="text-xs font-normal text-muted-foreground">
              {labelOf(date)}
            </span>
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              setHours(allOn ? new Set<number>() : new Set<number>(SLOT_HOURS))
            }
          >
            {allOn ? "전체 해제" : "전체 선택"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SLOT_HOURS.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => toggleHour(h)}
              className="contents"
            >
              <Badge
                variant={hours.has(h) ? "default" : "outline"}
                className="cursor-pointer px-2.5 py-1 text-sm"
              >
                {String(h).padStart(2, "0")}
              </Badge>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={pending}>
            {pending ? "저장 중..." : hours.size === 0 ? "휴무로 저장" : "저장"}
          </Button>
          {hasException && (
            <Button
              variant="ghost"
              onClick={() => clearFor(date)}
              disabled={pending}
            >
              되돌리기(예외 삭제)
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">등록된 예외</h3>
        {exceptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            등록된 날짜 예외가 없습니다.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {exceptions.map((e) => (
              <li
                key={e.date}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{labelOf(e.date)}</span>
                  <span className="ml-2 text-muted-foreground">
                    {e.hours.length === 0
                      ? "휴무"
                      : e.hours
                          .map((h) => String(h).padStart(2, "0"))
                          .join(", ")}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => clearFor(e.date)}
                  disabled={pending}
                >
                  삭제
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
