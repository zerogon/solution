"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { createLeaveEntry, updateLeaveEntry } from "@/actions/leave-entries";
import { DaysPreview } from "@/components/leave/DaysPreview";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { holidayOracle, type HolidayMap } from "@/lib/holidays-kr";
import { computeLeaveDays } from "@/lib/leave-days";
import { LEAVE_TYPE_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { LeaveType } from "@/generated/prisma/enums";

export interface EntryFormInitial {
  id: string;
  type: LeaveType;
  startIso: string;
  endIso: string;
  days: number;
  manualDays: boolean;
  memo: string;
}

/**
 * 연차 기록 추가·수정 폼. 과거 날짜도 받는다 — 엑셀에서 옮겨 적는 것이 첫 용도다.
 *
 * 일수는 서버와 같은 `computeLeaveDays`로 미리 보여 준다. 공휴일 데이터가 없는 해(대개 지난 해)는
 * 자동 계산이 `uncovered`로 멈추므로 "일수 직접 입력"을 켜서 엑셀에 적혀 있던 값을 그대로 넣는다.
 */
export function LeaveEntryForm({
  closedWeekdays,
  holidays,
  remainingByYear,
  defaultDate,
  initial,
}: {
  closedWeekdays: number[];
  holidays: { covered: number[]; years: Record<string, HolidayMap> };
  /** 연도 → 현재 잔여. 수정 중인 기록의 일수는 호출자가 이미 되돌려 넣었다. */
  remainingByYear: Record<number, number>;
  defaultDate: string;
  initial?: EntryFormInitial;
}) {
  const router = useRouter();
  const [type, setType] = useState<LeaveType>(initial?.type ?? LeaveType.FULL_DAY);
  const [start, setStart] = useState(initial?.startIso ?? defaultDate);
  const [end, setEnd] = useState(initial?.endIso ?? defaultDate);
  const [manual, setManual] = useState(initial?.manualDays ?? false);
  const [manualDays, setManualDays] = useState(initial?.manualDays ? String(initial.days) : "");
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [pending, startTransition] = useTransition();

  const oracle = useMemo(() => holidayOracle(holidays.covered, holidays.years), [holidays]);
  const isHalf = type !== LeaveType.FULL_DAY;
  const effectiveEnd = isHalf ? start : end;
  const year = Number(start.slice(0, 4));
  const remaining = remainingByYear[year] ?? 0;

  const preview = useMemo(() => {
    if (!start || !effectiveEnd) return null;
    return computeLeaveDays({ type, startIso: start, endIso: effectiveEnd, closedWeekdays, oracle });
  }, [type, start, effectiveEnd, closedWeekdays, oracle]);

  // 반차의 직접 입력은 0.5일 고정이다 — 공휴일 데이터가 없는 해의 반차를 적기 위한 통로일 뿐이다.
  const useManual = manual;
  const manualValue = isHalf ? 0.5 : Number(manualDays);
  const manualValid = isHalf || (manualDays !== "" && manualValue > 0 && Number.isInteger(manualValue * 2));
  // 직접 입력에서도 모양 오류(해 넘김·반차 이틀 등)는 막는다. 공휴일을 모르는 것만 괜찮다.
  const shapeOk = preview != null && (preview.ok || preview.reason === "uncovered" || preview.reason === "no_working_day" || preview.reason === "half_day_off");
  const canSubmit = useManual ? manualValid && shapeOk : Boolean(preview?.ok);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const payload = {
      type,
      startDate: start,
      endDate: effectiveEnd,
      manualDays: useManual ? manualValue : null,
      memo,
    };
    startTransition(async () => {
      const res = initial ? await updateLeaveEntry({ id: initial.id, ...payload }) : await createLeaveEntry(payload);
      if (res.ok) {
        toast.success(initial ? "기록을 고쳤습니다." : "기록했습니다.");
        router.push(`/leaves?year=${year}`);
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
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              required
              className="h-10"
            />
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox id="manual" checked={manual} onCheckedChange={(v) => setManual(v === true)} />
          <Label htmlFor="manual" className="text-sm font-normal">
            일수 직접 입력
          </Label>
        </div>
        {manual && !isHalf && (
          <div className="flex items-center gap-2">
            <Input
              aria-label="차감 일수"
              type="number"
              inputMode="decimal"
              min={0.5}
              max={31}
              step={0.5}
              value={manualDays}
              onChange={(e) => setManualDays(e.target.value)}
              className="h-10 w-28 font-mono tabular-nums"
              required
            />
            <span className="text-sm text-muted-foreground">일</span>
          </div>
        )}
      </div>

      <DaysPreview
        result={preview}
        remaining={remaining}
        year={year}
        manualDays={useManual && manualValid ? manualValue : null}
      />

      <div className="space-y-2">
        <Label htmlFor="memo">메모</Label>
        <Textarea
          id="memo"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="예: 가족 여행"
        />
      </div>

      <Button type="submit" className="h-11 w-full text-base" disabled={!canSubmit || pending}>
        {pending ? "저장 중..." : initial ? "고치기" : "기록하기"}
      </Button>
    </form>
  );
}
