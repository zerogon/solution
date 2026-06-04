import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TimelineTone = "default" | "accent" | "muted";

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
};

export function DayTimeline({
  items,
  hourStart = 10,
  hourEnd = 22,
  emptyHint,
}: {
  items: TimelineItem[];
  hourStart?: number;
  hourEnd?: number;
  emptyHint?: string;
}) {
  const byHour = new Map<number, TimelineItem[]>();
  for (const it of items) {
    const arr = byHour.get(it.hour) ?? [];
    arr.push(it);
    byHour.set(it.hour, arr);
  }
  const hours = Array.from(
    { length: hourEnd - hourStart + 1 },
    (_, i) => hourStart + i,
  );

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {hours.map((h) => {
        const events = byHour.get(h) ?? [];
        return (
          <div
            key={h}
            className="grid grid-cols-[3.25rem_1fr] border-t first:border-t-0"
          >
            <div className="py-3 pr-2 text-right font-mono text-xs tabular-nums text-muted-foreground">
              {String(h).padStart(2, "0")}:00
            </div>
            <div className="min-h-[3rem] space-y-1.5 border-l py-1.5 pr-2 pl-3">
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
