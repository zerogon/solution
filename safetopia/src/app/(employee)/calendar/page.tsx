import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { requireActiveUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getHolidayOracle } from "@/lib/holidays-server";
import { monthBounds, resolveMonthParam, shiftMonth } from "@/lib/calendar";
import { parseDate, toIsoDate, todayKstIso } from "@/lib/utils";
import { LEAVE_TYPE_LABEL } from "@/lib/labels";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MonthGrid } from "@/components/month-grid";

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
    }),
    user.branchId ? prisma.branch.findUnique({ where: { id: user.branchId }, select: { closedWeekdays: true } }) : null,
    getHolidayOracle(),
  ]);
  const byDate = new Map(days.map((d) => [toIsoDate(d.date), d]));
  const closed = branch?.closedWeekdays ?? [];
  const [y, mo] = ym.split("-").map(Number);

  return (
    <div className="space-y-6">
      <PageHeader
        title="내 캘린더"
        description="확정된 연차가 진한 색으로 표시됩니다."
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
            closedWeekdays={closed}
            cellClassName="min-h-16 sm:min-h-20"
            renderBadge={(iso, { holiday }) =>
              closed.includes(parseDate(iso).getUTCDay()) && !holiday ? (
                <span className="text-[10px] text-muted-foreground">휴무</span>
              ) : null
            }
            renderDay={(iso) => {
              const leave = byDate.get(iso);
              if (!leave) return null;
              return (
                <div
                  className="mt-0.5 truncate rounded bg-primary px-1 py-0.5 text-[10px] font-medium text-primary-foreground sm:text-[11px]"
                  title={LEAVE_TYPE_LABEL[leave.type]}
                >
                  {LEAVE_TYPE_LABEL[leave.type]}
                </div>
              );
            }}
          />
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-primary" />연차</span>
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-muted-foreground/30" />주말·지점 휴무·공휴일</span>
            <span className="inline-flex items-center gap-1"><span className="text-destructive">●</span>공휴일</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
