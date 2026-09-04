"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createLeaveRequest } from "@/actions/leave-requests";
import { DaysPreview } from "@/components/leave/DaysPreview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { holidayOracle, type HolidayMap } from "@/lib/holidays-kr";
import { computeLeaveDays } from "@/lib/leave-days";
import { LEAVE_TYPE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { LeaveType } from "@/generated/prisma/enums";

export function LeaveRequestForm({
  closedWeekdays,
  holidays,
  available,
  todayIso,
}: {
  closedWeekdays: number[];
  holidays: { covered: number[]; years: Record<string, HolidayMap> };
  available: number;
  todayIso: string;
}) {
  const router = useRouter();
  const [type, setType] = useState<LeaveType>(LeaveType.FULL_DAY);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pending, startTransition] = useTransition();

  const oracle = useMemo(() => holidayOracle(holidays.covered, holidays.years), [holidays]);
  const isHalf = type !== LeaveType.FULL_DAY;
  const effectiveEnd = isHalf ? start : end;

  const preview = useMemo(() => {
    if (!start || !effectiveEnd) return null;
    return computeLeaveDays({ type, startIso: start, endIso: effectiveEnd, closedWeekdays, oracle });
  }, [type, start, effectiveEnd, closedWeekdays, oracle]);

  const canSubmit = Boolean(preview?.ok) && (preview?.ok ? preview.days <= available : false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createLeaveRequest({
        type,
        startDate: start,
        endDate: effectiveEnd,
        reason: String(fd.get("reason") ?? ""),
      });
      if (res.ok) {
        toast.success("신청했습니다. 관리자 승인을 기다려주세요.");
        router.push("/dashboard");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label>휴가 유형</Label>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup">
          {Object.values(LeaveType).map((t) => {
            const on = t === type;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setType(t)}
                className={cn(
                  "h-10 rounded-lg border text-sm font-medium transition-colors",
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {LEAVE_TYPE_LABEL[t]}
              </button>
            );
          })}
        </div>
      </div>

      <div className={cn("grid gap-3", !isHalf && "sm:grid-cols-2")}>
        <div className="space-y-2">
          <Label htmlFor="startDate">{isHalf ? "날짜" : "시작일"}</Label>
          <Input
            id="startDate"
            type="date"
            value={start}
            min={todayIso}
            onChange={(e) => {
              setStart(e.target.value);
              if (!end || e.target.value > end) setEnd(e.target.value);
            }}
            required
            className="h-10"
          />
        </div>
        {!isHalf && (
          <div className="space-y-2">
            <Label htmlFor="endDate">종료일</Label>
            <Input
              id="endDate"
              type="date"
              value={end}
              min={start || todayIso}
              onChange={(e) => setEnd(e.target.value)}
              required
              className="h-10"
            />
          </div>
        )}
      </div>

      <DaysPreview result={preview} available={available} />

      <div className="space-y-2">
        <Label htmlFor="reason">사유</Label>
        <Textarea id="reason" name="reason" required maxLength={300} placeholder="예: 가족 행사 참석" />
      </div>

      <Button type="submit" className="h-11 w-full text-base" disabled={!canSubmit || pending}>
        {pending ? "신청 중..." : "신청하기"}
      </Button>
    </form>
  );
}
