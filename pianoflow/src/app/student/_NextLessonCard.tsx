import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function NextLessonCard({
  dateLabel,
  timeLabel,
  teacherName,
  daysUntil,
  action,
}: {
  dateLabel: string;
  timeLabel: string;
  teacherName: string;
  daysUntil: number;
  action: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium text-primary">다음 레슨</p>
            {daysUntil === 0 ? (
              <Badge>오늘</Badge>
            ) : daysUntil === 1 ? (
              <Badge variant="secondary">내일</Badge>
            ) : (
              <Badge variant="outline" className="font-mono tabular-nums">
                D-{daysUntil}
              </Badge>
            )}
          </div>
          <p className="mt-1.5 flex items-baseline gap-2">
            <span className="font-mono text-4xl font-semibold tracking-tight tabular-nums">
              {timeLabel}
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {dateLabel}
            </span>
          </p>
          <p className="mt-1 truncate text-sm font-medium">
            {teacherName} 선생님
          </p>
        </div>
        <div className="shrink-0">{action}</div>
      </div>
    </div>
  );
}
