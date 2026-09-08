import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { requireActiveUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getHolidayOracle } from "@/lib/holidays-server";
import { SHADED_DAY_CELL, monthBounds, resolveMonthParam, shiftMonth } from "@/lib/calendar";
import { cn, parseDate, toIsoDate, todayKstIso } from "@/lib/utils";
import { LEAVE_TYPE_LABEL } from "@/lib/labels";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MonthGrid } from "@/components/month-grid";
import { DayLeaveList } from "@/components/leave/DayLeaveList";

export const dynamic = "force-dynamic";

/**
 * 내 캘린더 — 본인 연차(진한 색) + **같은 지점** 동료의 확정 연차(연한 칩).
 * 다른 지점은 비공개다. `user.branchId` 필터를 빼면 전 지점 연차가 노출되니 건드릴 때 주의.
 * 소속 지점이 없으면 본인 것만 읽는다.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { user } = await requireActiveUser();
  const { m } = await searchParams;
  const today = todayKstIso();
  const ym = resolveMonthParam(m, today);
  const { first, last } = monthBounds(ym);

  const [days, branch, { oracle }] = await Promise.all([
    prisma.leaveRequestDay.findMany({
      where: {
        date: { gte: parseDate(first), lte: parseDate(last) },
        ...(user.branchId ? { user: { branchId: user.branchId } } : { userId: user.id }),
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: [{ user: { name: "asc" } }],
    }),
    user.branchId ? prisma.branch.findUnique({ where: { id: user.branchId }, select: { closedWeekdays: true } }) : null,
    getHolidayOracle(),
  ]);

  type Day = (typeof days)[number];
  const byDate = new Map<string, { mine: Day | null; others: Day[] }>();
  for (const d of days) {
    const k = toIsoDate(d.date);
    const slot = byDate.get(k) ?? { mine: null, others: [] };
    if (d.userId === user.id) slot.mine = d;
    else slot.others.push(d);
    byDate.set(k, slot);
  }
  const closed = branch?.closedWeekdays ?? [];
  const [y, mo] = ym.split("-").map(Number);

  return (
    <div className="space-y-6">
      <PageHeader
        title="내 캘린더"
        description={
          user.branchId
            ? "내 연차는 진한 색, 같은 지점 동료는 연한 색으로 표시됩니다."
            : "확정된 연차가 진한 색으로 표시됩니다."
        }
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
            cellClassName="min-h-20 sm:min-h-24"
            renderBadge={(_iso, { closed, holiday }) =>
              closed && !holiday ? <span className="text-[10px] text-muted-foreground">휴무</span> : null
            }
            renderDay={(iso) => {
              const slot = byDate.get(iso);
              if (!slot) return null;
              return (
                <>
                  {slot.mine && (
                    <div
                      className="mt-0.5 truncate rounded bg-primary px-1 py-0.5 text-[10px] font-medium text-primary-foreground sm:text-[11px]"
                      title={LEAVE_TYPE_LABEL[slot.mine.type]}
                    >
                      {LEAVE_TYPE_LABEL[slot.mine.type]}
                    </div>
                  )}
                  <DayLeaveList
                    max={3}
                    items={slot.others.map((d) => ({ id: d.id, name: d.user.name, branchName: null, type: d.type }))}
                  />
                </>
              );
            }}
          />
          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-primary" />내 연차</span>
            {user.branchId && (
              <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-primary/15 ring-1 ring-inset ring-primary/40" />같은 지점 동료</span>
            )}
            <span className="inline-flex items-center gap-1"><span className={cn("size-2.5 rounded-sm ring-1 ring-border", SHADED_DAY_CELL)} />주말·지점 휴무·공휴일</span>
            <span className="inline-flex items-center gap-1"><span className="text-destructive">●</span>공휴일</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
