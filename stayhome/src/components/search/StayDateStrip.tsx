"use client";

import { useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { addDaysIso, isoWeekStart, parseDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** 스와이프로 인정할 최소 가로 이동(px). */
const SWIPE_MIN_X = 48;
/** 세로보다 가로가 이만큼 더 움직여야 주 이동으로 본다(세로 스크롤과의 충돌 방지). */
const SWIPE_XY_RATIO = 1.5;
/** 이 거리를 넘어서면 드래그 방향을 가로로 확정한다. */
const DRAG_LOCK_X = 10;

function daysOfWeek(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i));
}

/**
 * 체크인 날짜 선택용 주간 스트립.
 *
 * 기존 UI는 `<input type="date">` 두 개였다. 모바일에서 네이티브 피커를 두 번 여는
 * 대신, 주 단위로 스와이프하며 날짜를 한 번에 고르게 한다. 먼 미래 날짜는
 * "직접 입력"으로 여전히 네이티브 피커를 쓸 수 있다.
 */
export function StayDateStrip({
  value,
  today,
  onChange,
}: {
  /** 선택된 체크인 날짜 "YYYY-MM-DD". */
  value: string;
  /** KST 기준 오늘 "YYYY-MM-DD". 이보다 과거는 선택할 수 없다. */
  today: string;
  onChange: (next: string) => void;
}) {
  const [weekStart, setWeekStart] = useState(() => isoWeekStart(value));
  const [showPicker, setShowPicker] = useState(false);

  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; axis: "?" | "x" | "y" } | null>(null);
  // 드래그가 남긴 잔여 click이 날짜를 선택해버리는 것을 막는 플래그.
  const swiped = useRef(false);

  const weeks = useMemo(
    () => [
      daysOfWeek(addDaysIso(weekStart, -7)),
      daysOfWeek(weekStart),
      daysOfWeek(addDaysIso(weekStart, 7)),
    ],
    [weekStart],
  );

  const currentWeek = weeks[1];
  const rangeLabel = useMemo(() => {
    const from = parseDate(currentWeek[0]);
    const to = parseDate(currentWeek[6]);
    const sameMonth = from.getUTCMonth() === to.getUTCMonth();
    const fmt = (d: Date) =>
      sameMonth
        ? `${d.getUTCDate()}`
        : `${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
    return `${from.getUTCFullYear()}. ${from.getUTCMonth() + 1}. ${fmt(from)} – ${fmt(to)}`;
  }, [currentWeek]);

  // 이번 주가 오늘이 속한 주라면 이전 주로는 갈 수 없다(과거 날짜는 예약 불가).
  const canGoPrev = addDaysIso(weekStart, -1) >= isoWeekStart(today);

  function setTransform(x: number, animate: boolean) {
    const el = trackRef.current;
    if (!el) return;
    el.style.transition = animate
      ? "transform 280ms cubic-bezier(0.32, 0.72, 0, 1)"
      : "none";
    el.style.transform = `translateX(calc(-100% + ${x}px))`;
  }

  function shiftWeek(delta: -1 | 1) {
    if (delta === -1 && !canGoPrev) return;
    setWeekStart((w) => addDaysIso(w, delta * 7));
    setTransform(0, false);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse") return;
    drag.current = { x: e.clientX, y: e.clientY, axis: "?" };
    swiped.current = false;
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;

    if (d.axis === "?") {
      if (Math.abs(dx) < DRAG_LOCK_X && Math.abs(dy) < DRAG_LOCK_X) return;
      d.axis = Math.abs(dx) > Math.abs(dy) * SWIPE_XY_RATIO ? "x" : "y";
    }
    if (d.axis !== "x") return;

    // 더 갈 수 없는 방향(과거)은 고무줄처럼 저항을 준다.
    const resisted = dx > 0 && !canGoPrev ? dx * 0.3 : dx;
    setTransform(resisted, false);
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== "x") return;

    const dx = e.clientX - d.x;
    swiped.current = Math.abs(dx) > DRAG_LOCK_X;

    if (dx <= -SWIPE_MIN_X) shiftWeek(1);
    else if (dx >= SWIPE_MIN_X && canGoPrev) shiftWeek(-1);
    else setTransform(0, true);
  }

  function selectDay(day: string) {
    if (day < today) return;
    onChange(day);
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 px-2 py-2">
        {canGoPrev ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => shiftWeek(-1)}
            aria-label="이전 주"
          >
            <ChevronLeft className="size-4" />
          </Button>
        ) : (
          // 비활성 버튼 대신 비대화형 span — 탭해도 아무 일 없다는 걸 시각적으로만 알린다.
          <span className="flex size-7 items-center justify-center text-muted-foreground/40">
            <ChevronLeft className="size-4" />
          </span>
        )}

        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {rangeLabel}
        </span>

        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowPicker((v) => !v)}
            aria-label="날짜 직접 입력"
            aria-pressed={showPicker}
            className={cn(showPicker && "bg-muted")}
          >
            <CalendarDays className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => shiftWeek(1)}
            aria-label="다음 주"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div
        className="touch-pan-y overflow-hidden border-t"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // 드래그 직후의 잔여 click이 날짜 버튼에 닿지 않도록 캡처 단계에서 삼킨다.
        onClickCapture={(e) => {
          if (swiped.current) {
            e.stopPropagation();
            e.preventDefault();
            swiped.current = false;
          }
        }}
      >
        <div
          ref={trackRef}
          className="flex"
          style={{ transform: "translateX(-100%)" }}
        >
          {weeks.map((week, i) => (
            <div key={i} className="grid w-full shrink-0 grid-cols-7">
              {week.map((day) => {
                const d = parseDate(day);
                const dow = d.getUTCDay();
                const selected = day === value;
                const isToday = day === today;
                const disabled = day < today;
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={disabled}
                    onClick={() => selectDay(day)}
                    aria-label={`${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`}
                    aria-pressed={selected}
                    className={cn(
                      "flex flex-col items-center gap-1 py-2 transition-colors",
                      dow === 0 || dow === 6 ? "bg-muted/50" : "",
                      disabled ? "cursor-default opacity-35" : "hover:bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[11px]",
                        dow === 0
                          ? "text-destructive/70"
                          : dow === 6
                            ? "text-chart-2"
                            : "text-muted-foreground",
                      )}
                    >
                      {WEEKDAYS[dow]}
                    </span>
                    <span
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full font-mono text-sm tabular-nums transition-colors",
                        selected && "bg-primary font-semibold text-primary-foreground",
                        !selected && isToday && "ring-1 ring-primary/40",
                      )}
                    >
                      {d.getUTCDate()}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {showPicker && (
        <div className="flex items-center gap-2 border-t px-3 py-2.5">
          <label htmlFor="checkin-direct" className="text-xs text-muted-foreground">
            직접 입력
          </label>
          <Input
            id="checkin-direct"
            type="date"
            className="h-8 w-auto"
            value={value}
            min={today}
            onChange={(e) => {
              const next = e.target.value;
              if (!next || next < today) return;
              onChange(next);
              setWeekStart(isoWeekStart(next));
              setTransform(0, false);
            }}
          />
        </div>
      )}
    </div>
  );
}
