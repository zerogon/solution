"use client";

import { Trash2, CalendarX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrackBadge } from "@/components/TrackBadge";
import { UserSchedule } from "@/types/agenda";
import { getSessionById, formatTime } from "@/data/sessions";

interface ScheduleListProps {
  schedule: UserSchedule;
  onRemove: (time: string) => void;
}

export function ScheduleList({ schedule, onRemove }: ScheduleListProps) {
  const entries = Object.entries(schedule)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, sessionId]) => ({
      time,
      session: getSessionById(sessionId),
    }))
    .filter((e) => e.session);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <CalendarX className="size-8 text-muted-foreground/60" />
        </div>
        <p className="text-sm font-semibold mb-1">선택한 세션이 없습니다</p>
        <p className="text-xs text-muted-foreground max-w-[200px]">
          메인 화면에서 관심 세션을 탭하여 나만의 일정을 만들어보세요
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map(({ time, session }, index) => (
        <div key={time} className="flex gap-3 items-stretch">
          {/* Time column */}
          <div className="flex flex-col items-center w-14 flex-shrink-0 pt-3">
            <span className="text-xs font-bold text-primary tabular-nums whitespace-nowrap">
              {formatTime(time)}
            </span>
            {index < entries.length - 1 && (
              <div className="flex-1 w-px bg-border mt-2" />
            )}
          </div>

          {/* Session card */}
          <Card size="sm" className="flex-1 group/item">
            <CardContent className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="mb-1">
                    <TrackBadge track={session!.track} />
                  </div>
                  <h3 className="text-sm font-semibold leading-snug line-clamp-2">
                    {session!.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {session!.speaker}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="flex-shrink-0 text-muted-foreground/40 hover:text-destructive opacity-0 group-hover/item:opacity-100 transition-opacity focus-visible:opacity-100 -m-1 p-1"
                  onClick={() => onRemove(time)}
                  aria-label={`${session!.title} 삭제`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
