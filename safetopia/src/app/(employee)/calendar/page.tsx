import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { requireActiveUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getHolidayOracle } from "@/lib/holidays-server";
import { monthBounds, monthGrid, resolveMonthParam, shiftMonth } from "@/lib/calendar";
import { cn, parseDate, toIsoDate, todayKstIso } from "@/lib/utils";
import { LEAVE_TYPE_LABEL, WEEKDAY_LABEL } from "@/lib/labels";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LeaveStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { user } = await requireActiveUser();
  const { m } = await searchParams;
  const today = todayKstIso();
  const ym = resolveMonthParam(m, today);
  const { first, last } = monthBounds(ym);

  const [days, branch, { oracle }] = await Promise.all([
    prisma.leaveRequestDay.findMany({
      where: { userId: user.id, date: { gte: parseDate(first), lte: parseDate(last) } },
      include: { leaveRequest: { select: { status: true, reason: true } } },
    }),
    user.branchId ? prisma.branch.findUnique({ where: { id: user.branchId }, select: { closedWeekdays: true } }) : null,
    getHolidayOracle(),
  ]);
  const byDate = new Map(days.map((d) => [toIsoDate(d.date), d]));
  const closed = branch?.closedWeekdays ?? [];
  const grid = monthGrid(ym);
  const [y, mo] = ym.split("-").map(Number);

  return (
    <div className="space-y-6">
      <PageHeader
        title="내 캘린더"
        description="승인된 연차는 진한 색, 승인 대기는 노란색으로 표시됩니다."
        action={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" render={<Link href={`/calendar?m=${shiftMonth(ym, -1)}`} />} nativeButton={false} aria-label="이전 달">
              <ChevronLeft />
            </Button>
            <span className="min-w-24 text-center font-mono text-sm font-semibold tabular-nums">
              {y}.{String(mo).padStart(2, "0")}
            </span>
            <Button variant="outline" size="icon-sm" render={<Link href={`/calendar?m=${shiftMonth(ym, 1)}`} />} nativeButton={false} aria-label="다음 달">
              <ChevronRight />
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-2 sm:p-4">
          <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
            {WEEKDAY_LABEL.map((w, i) => (
              <div key={w} className={cn("py-1", i === 0 && "text-destructive/70")}>
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
            {grid.map(({ iso, inMonth }) => {
              const d = parseDate(iso);
              const dow = d.getUTCDay();
              const leave = byDate.get(iso);
              const holiday = oracle.covers(iso) && oracle.isHoliday(iso) ? oracle.nameOf(iso) : null;
              const isClosed = closed.includes(dow);
              const isToday = iso === today;
              return (
                <div
                  key={iso}
                  className={cn(
                    "min-h-16 bg-background p-1 sm:min-h-20 sm:p-1.5",
                    !inMonth && "bg-muted/40 text-muted-foreground/50",
                    inMonth && isClosed && "bg-muted/60",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full font-mono text-xs tabular-nums",
                        isToday && "bg-foreground text-background font-semibold",
                        !isToday && (dow === 0 || holiday) && inMonth && "text-destructive",
                      )}
                    >
                      {d.getUTCDate()}
                    </span>
                    {inMonth && isClosed && !holiday && <span className="text-[10px] text-muted-foreground">휴무</span>}
                  </div>
                  {holiday && inMonth && (
                    <div className="mt-0.5 truncate text-[10px] text-destructive/80" title={holiday}>
                      {holiday}
                    </div>
                  )}
                  {leave && inMonth && (
                    <div
                      className={cn(
                        "mt-0.5 truncate rounded px-1 py-0.5 text-[10px] font-medium sm:text-[11px]",
                        leave.leaveRequest.status === LeaveStatus.APPROVED
                          ? "bg-primary text-primary-foreground"
                          : "bg-amber-100 text-amber-800",
                      )}
                      title={`${LEAVE_TYPE_LABEL[leave.type]} · ${leave.leaveRequest.reason}`}
                    >
                      {LEAVE_TYPE_LABEL[leave.type]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-primary" />승인</span>
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-amber-300" />승인 대기</span>
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-muted-foreground/30" />지점 휴무</span>
            <span className="inline-flex items-center gap-1"><span className="text-destructive">●</span>공휴일</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
