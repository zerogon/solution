import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TimelineTone = "default" | "accent" | "muted" | "now";

export interface TimelineItem {
  hour: number;
  title: string;
  subtitle?: string;
  tone?: TimelineTone;
  /** 제목 앞에 붙는 작은 상태 아이콘 (예: 강제예약 Shield) */
  icon?: ReactNode;
  trailing?: ReactNode;
}

const BLOCK_TONE: Record<TimelineTone, string> = {
  default: "border-border bg-card",
  accent: "border-primary/30 bg-accent",
  muted: "border-border/60 bg-muted/50 text-muted-foreground",
  now: "border-primary/50 bg-accent ring-1 ring-primary/20",
};

type Segment =
  | { type: "hour"; hour: number }
  | { type: "gap"; from: number; to: number };

export function DayTimeline({
  items,
  hourStart = 10,
  hourEnd = 22,
  emptyHint,
  nowMinutes,
  collapseEmptyHours = false,
}: {
  items: TimelineItem[];
  hourStart?: number;
  hourEnd?: number;
  emptyHint?: string;
  /** KST 자정 이후 경과 분(0-1439). 주어지면 현재 시각 라인/하이라이트 표시 */
  nowMinutes?: number;
  /** 예약 없는 연속 시간대를 얇은 축약 행으로 접기 */
  collapseEmptyHours?: boolean;
}) {
  const byHour = new Map<number, TimelineItem[]>();
  for (const it of items) {
    const arr = byHour.get(it.hour) ?? [];
    arr.push(it);
    byHour.set(it.hour, arr);
  }
  const nowHour =
    nowMinutes !== undefined &&
    nowMinutes >= hourStart * 60 &&
    nowMinutes < (hourEnd + 1) * 60
      ? Math.floor(nowMinutes / 60)
      : undefined;

  const segments: Segment[] = [];
  for (let h = hourStart; h <= hourEnd; h++) {
    if (collapseEmptyHours && !byHour.has(h) && h !== nowHour) {
      const last = segments[segments.length - 1];
      if (last?.type === "gap") last.to = h;
      else segments.push({ type: "gap", from: h, to: h });
    } else {
      segments.push({ type: "hour", hour: h });
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {segments.map((seg) => {
        if (seg.type === "gap") {
          return (
            <div
              key={`gap-${seg.from}`}
              className="grid grid-cols-[3.25rem_1fr] border-t first:border-t-0"
            >
              <div className="py-1 pr-2 text-right font-mono text-[10px] tabular-nums text-muted-foreground/60">
                {seg.from === seg.to
                  ? `${seg.from}시`
                  : `${seg.from}–${seg.to + 1}시`}
              </div>
              <div className="border-l border-dashed py-1 pl-3" />
            </div>
          );
        }
        const h = seg.hour;
        const events = byHour.get(h) ?? [];
        const isNow = h === nowHour;
        return (
          <div
            key={h}
            className={cn(
              "grid grid-cols-[3.25rem_1fr] border-t first:border-t-0",
              isNow && "bg-accent/30",
            )}
          >
            <div
              className={cn(
                "py-3 pr-2 text-right font-mono text-xs tabular-nums",
                isNow ? "font-semibold text-primary" : "text-muted-foreground",
              )}
            >
              {String(h).padStart(2, "0")}:00
            </div>
            <div
              className={cn(
                "min-h-[3rem] space-y-1.5 border-l py-1.5 pr-2 pl-3",
                isNow && "relative",
              )}
            >
              {isNow && nowMinutes !== undefined && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                  style={{ top: `${((nowMinutes % 60) / 60) * 100}%` }}
                >
                  <span className="-ml-0.5 size-1.5 rounded-full bg-primary" />
                  <span className="h-px flex-1 bg-primary/60" />
                </div>
              )}
              {events.map((e, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-md border px-3 py-2",
                    BLOCK_TONE[e.tone ?? "default"],
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {e.icon}
                      <span className="truncate text-sm font-medium">
                        {e.title}
                      </span>
                    </div>
                    {e.subtitle && (
                      <div className="truncate text-xs text-muted-foreground">
                        {e.subtitle}
                      </div>
                    )}
                  </div>
                  {e.trailing && <div className="shrink-0">{e.trailing}</div>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {items.length === 0 && emptyHint && (
        <div className="border-t px-3 py-4 text-center text-xs text-muted-foreground">
          {emptyHint}
        </div>
      )}
    </div>
  );
}
