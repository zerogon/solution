import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { requireOwner } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getHolidayOracle } from "@/lib/holidays-server";
import { SHADED_DAY_CELL, monthBounds, resolveMonthParam, shiftMonth } from "@/lib/calendar";
import { cn, parseDate, toIsoDate, todayKstIso } from "@/lib/utils";
import { LEAVE_TYPE_LABEL } from "@/lib/labels";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MonthGrid } from "@/components/month-grid";
import { LeaveType } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

/** 월 캘린더 — `LeaveEntryDay`를 읽는다. 칩을 누르면 그 기록을 고친다. */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const owner = await requireOwner();
  const { m } = await searchParams;
  const today = todayKstIso();
  const ym = resolveMonthParam(m, today);
  const { first, last } = monthBounds(ym);

  const [days, { oracle }] = await Promise.all([
    prisma.leaveEntryDay.findMany({
      where: { date: { gte: parseDate(first), lte: parseDate(last) } },
      include: { entry: { select: { memo: true } } },
    }),
    getHolidayOracle(),
  ]);

  const byDate = new Map(days.map((d) => [toIsoDate(d.date), d]));
  const [y, mo] = ym.split("-").map(Number);

  return (
    <div className="space-y-6">
      <PageHeader
        title="캘린더"
        description="연차를 쓴 날이 색으로 표시됩니다."
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
          <MonthGrid
            ym={ym}
            today={today}
            oracle={oracle}
            closedWeekdays={owner.closedWeekdays}
            cellClassName="min-h-20 sm:min-h-24"
            renderDay={(iso) => {
              const d = byDate.get(iso);
              if (!d) return null;
              const half = d.type !== LeaveType.FULL_DAY;
              return (
                <Link
                  href={`/leaves/${d.entryId}/edit`}
                  className={cn(
                    "mt-0.5 block truncate rounded px-1 py-0.5 text-[10px] font-medium sm:text-[11px]",
                    half
                      ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/40"
                      : "bg-primary text-primary-foreground",
                  )}
                  title={[LEAVE_TYPE_LABEL[d.type], d.entry.memo].filter(Boolean).join(" · ")}
                >
                  {half ? (d.type === LeaveType.AM_HALF ? "오전" : "오후") : "연차"}
                  {d.entry.memo && <span className="hidden opacity-80 sm:inline"> {d.entry.memo}</span>}
                </Link>
              );
            }}
          />
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-primary" />연차</span>
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-primary/15 ring-1 ring-inset ring-primary/40" />반차</span>
            <span className="inline-flex items-center gap-1"><span className={cn("size-2.5 rounded-sm ring-1 ring-border", SHADED_DAY_CELL)} />주말·쉬는 요일·공휴일</span>
            <span className="inline-flex items-center gap-1"><span className="text-destructive">●</span>공휴일</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
