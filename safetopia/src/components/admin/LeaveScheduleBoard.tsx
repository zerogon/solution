import { Users } from "lucide-react";

import { LeaveType } from "@/generated/prisma/enums";
import type { BoardGroup } from "@/lib/schedule-board";
import { LEAVE_TYPE_LABEL, WEEKDAY_LABEL, formatDays } from "@/lib/labels";
import { cn, parseDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/** 모바일에서는 앞 N일만 열로 보여 준다. 데이터는 전체를 받는다. */
const MOBILE_DAYS = 7;

/**
 * 직원×날짜 스케줄 격자(지점별 카드). 서버 컴포넌트 — 훅 없음, props는 평면 객체만.
 * 색은 primary(휴가)·muted(휴무/공휴일 열)·destructive(일·공휴일 헤더)만 쓴다.
 */
export function LeaveScheduleBoard({
  days,
  today,
  groups,
  holidays,
}: {
  days: string[];
  today: string;
  groups: BoardGroup[];
  /** iso → 공휴일명(없으면 null). */
  holidays: Record<string, string | null>;
}) {
  if (groups.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState icon={Users} title="재직 직원이 없습니다" description="직원을 등록하면 지점별 휴가 일정이 여기에 표시됩니다." />
        </CardContent>
      </Card>
    );
  }

  const colClass = (i: number) => cn("w-8 px-0 text-center sm:w-9", i >= MOBILE_DAYS && "hidden md:table-cell");

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const closed = new Set(g.branch?.closedWeekdays ?? []);
        const isOffDay = (iso: string) => closed.has(parseDate(iso).getUTCDay()) || holidays[iso] != null;
        return (
          <Card key={g.branch?.id ?? "none"}>
            <CardContent className="p-0">
              <div className="flex items-baseline gap-2 px-4 pt-3 pb-1">
                <h3 className="font-heading text-base font-semibold">{g.branch?.name ?? "소속 없음"}</h3>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">{g.members.length}명</span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20 pl-4 sm:w-24">이름</TableHead>
                    {days.map((iso, i) => {
                      const d = parseDate(iso);
                      const holiday = holidays[iso];
                      const isToday = iso === today;
                      return (
                        <TableHead
                          key={iso}
                          className={cn(colClass(i), "h-auto py-1.5 align-top", isOffDay(iso) && "bg-muted/40")}
                          title={holiday ?? undefined}
                        >
                          <div
                            className={cn(
                              "mx-auto flex size-6 items-center justify-center rounded-full font-mono text-xs leading-none tabular-nums",
                              isToday && "bg-foreground font-semibold text-background",
                              !isToday && (d.getUTCDay() === 0 || holiday) && "text-destructive",
                            )}
                          >
                            {d.getUTCDate()}
                          </div>
                          <div className={cn("mt-0.5 text-[10px] font-normal leading-none", d.getUTCDay() === 0 && "text-destructive/70")}>
                            {WEEKDAY_LABEL[d.getUTCDay()]}
                          </div>
                        </TableHead>
                      );
                    })}
                    <TableHead className="w-28 pr-4 text-right sm:w-36">잔여</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="truncate pl-4 font-medium">{m.name}</TableCell>
                      {days.map((iso, i) => {
                        const type = m.cells[iso];
                        return (
                          <TableCell key={iso} className={cn(colClass(i), "py-1.5", isOffDay(iso) && "bg-muted/40")}>
                            {type ? (
                              <LeaveCell type={type} title={`${m.name} · ${LEAVE_TYPE_LABEL[type]}`} />
                            ) : (
                              <span className="block text-center text-muted-foreground/40">·</span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="pr-4 text-right">
                        <RemainingCell summary={m.summary} />
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableCell className="pl-4 text-xs text-muted-foreground">휴가</TableCell>
                    {days.map((iso, i) => {
                      const n = g.offByDay[iso];
                      return (
                        <TableCell key={iso} className={cn(colClass(i), "py-1.5 font-mono text-xs tabular-nums")}>
                          {n ? <span className="text-foreground">{n}</span> : <span className="text-muted-foreground/40">·</span>}
                        </TableCell>
                      );
                    })}
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** 연차 = 꽉 찬 블록, 오전 반차 = 왼쪽 절반, 오후 반차 = 오른쪽 절반. */
function LeaveCell({ type, title }: { type: LeaveType; title: string }) {
  return (
    <div className="mx-auto h-5 w-5 overflow-hidden rounded-sm bg-primary/15" title={title} aria-label={title}>
      <div
        className={cn(
          "h-full bg-primary",
          type === LeaveType.FULL_DAY && "w-full",
          type === LeaveType.AM_HALF && "w-1/2",
          type === LeaveType.PM_HALF && "ml-auto w-1/2",
        )}
      />
    </div>
  );
}

function RemainingCell({ summary }: { summary: BoardGroup["members"][number]["summary"] }) {
  if (!summary) return <span className="text-xs text-muted-foreground">미부여</span>;
  const ratio = summary.total > 0 ? Math.max(0, Math.min(1, summary.remaining / summary.total)) : 0;
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <span className="font-mono text-sm tabular-nums">
        <span className="font-semibold">{formatDays(summary.remaining)}</span>
        <span className="text-muted-foreground"> / {summary.total}</span>
      </span>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-primary/15 sm:w-20">
        <div className="h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
