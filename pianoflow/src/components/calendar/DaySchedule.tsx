import { EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { kstHourOf } from "@/lib/slots";
import {
  DayTimeline,
  type TimelineItem,
} from "@/components/schedule/DayTimeline";
import { VisibilityBadgeToggle } from "./VisibilityBadgeToggle";

export interface DayScheduleItem {
  id: string;
  slotDatetime: Date;
  teacherName: string;
  studentName: string;
  isMine: boolean;
  isPrivate: boolean;
}

interface Props {
  dateStr: string;
  items: DayScheduleItem[];
}

export function DaySchedule({ dateStr, items }: Props) {
  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {dateStr}에 등록된 예약이 아직 없습니다.
      </p>
    );
  }

  const timelineItems: TimelineItem[] = items.map((it) => ({
    hour: kstHourOf(it.slotDatetime),
    title: it.isPrivate && !it.isMine ? "비공개" : it.studentName,
    subtitle: `${it.teacherName} 선생님`,
    tone: it.isMine ? "accent" : it.isPrivate ? "muted" : "default",
    icon:
      it.isPrivate && !it.isMine ? (
        <EyeOff aria-hidden className="size-3.5 text-muted-foreground" />
      ) : undefined,
    trailing: it.isMine ? (
      <span className="flex items-center gap-1">
        <Badge>나</Badge>
        <VisibilityBadgeToggle reservationId={it.id} isPrivate={it.isPrivate} />
      </span>
    ) : undefined,
  }));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm border border-primary/30 bg-accent" />
          내 예약
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm border border-border bg-card" />
          다른 학생
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm border border-border/60 bg-muted/50" />
          비공개
        </span>
      </div>
      <DayTimeline items={timelineItems} collapseEmptyHours />
    </div>
  );
}
