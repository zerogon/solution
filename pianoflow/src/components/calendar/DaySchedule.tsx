import { Badge } from "@/components/ui/badge";
import { kstHourOf } from "@/lib/slots";

export interface DayScheduleItem {
  id: string;
  slotDatetime: Date;
  teacherName: string;
  studentName: string;
  isMine: boolean;
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

  const groups = new Map<number, DayScheduleItem[]>();
  for (const item of items) {
    const h = kstHourOf(item.slotDatetime);
    if (!groups.has(h)) groups.set(h, []);
    groups.get(h)!.push(item);
  }
  const hours = [...groups.keys()].sort((a, b) => a - b);

  return (
    <ul className="space-y-2">
      {hours.map((h) => (
        <li
          key={h}
          className="flex items-center gap-4 rounded-lg border border-border/60 bg-card/30 p-3 transition-colors hover:border-border hover:bg-card/60"
        >
          <div className="w-14 shrink-0 text-sm font-semibold tabular-nums text-foreground">
            {String(h).padStart(2, "0")}:00
          </div>
          <div className="flex flex-1 flex-wrap gap-2">
            {groups.get(h)!.map((it) => (
              <Badge
                key={it.id}
                variant={it.isMine ? "default" : "outline"}
                className={
                  it.isMine
                    ? "px-2 py-1 text-xs font-medium ring-2 ring-primary/20 ring-offset-1 ring-offset-background"
                    : "px-2 py-1 text-xs font-normal"
                }
              >
                {it.studentName}
                {it.isMine && (
                  <span className="ml-1 text-[10px] opacity-80">(나)</span>
                )}
                <span className="ml-1 opacity-70">
                  · {it.teacherName} 선생님
                </span>
              </Badge>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
