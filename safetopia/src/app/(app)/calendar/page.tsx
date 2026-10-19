import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";

import { requireOwner } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getHolidayOracle } from "@/lib/holidays-server";
import { getYearSummaries } from "@/lib/queries";
import { SHADED_DAY_CELL, monthBounds, resolveMonthParam, shiftMonth } from "@/lib/calendar";
import { LEAVE_TYPE_LABEL, WEEKDAY_LABEL, formatDays } from "@/lib/labels";
import { cn, parseDate, toIsoDate, todayKstIso } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MonthGrid } from "@/components/month-grid";
import { EntryDialog } from "@/components/leave/EntryDialog";
import { LeaveType } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f-]{36}$/;

/**
 * 앱의 본 화면(2026-10-19 최소화 — 화면은 이것과 설정 둘뿐). 위에 그 해 잔여 한 줄, 아래 월 달력.
 * 빈 날짜를 누르면 `?add=날짜`, 기록 칩을 누르면 `?entry=id`로 같은 페이지가 다시 그려지며 창이 열린다.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; add?: string; entry?: string }>;
}) {
  const owner = await requireOwner();
  const { m, add, entry: entryId } = await searchParams;
  const today = todayKstIso();
  const ym = resolveMonthParam(m, today);
  const year = Number(ym.slice(0, 4));
  const { first, last } = monthBounds(ym);
  const here = `/calendar?m=${ym}`;

  const editing = entryId && UUID_RE.test(entryId) ? await prisma.leaveEntry.findUnique({ where: { id: entryId } }) : null;
  const addDate = add && ISO_RE.test(add) ? add : null;
  const dialogOpen = Boolean(editing || addDate);

  const [days, summaries, { oracle, payload }] = await Promise.all([
    prisma.leaveEntryDay.findMany({
      where: { date: { gte: parseDate(first), lte: parseDate(last) } },
      include: { entry: { select: { memo: true } } },
    }),
    getYearSummaries(year),
    getHolidayOracle(),
  ]);

  const current = summaries.find((s) => s.year === year)!;
  const byDate = new Map(days.map((d) => [toIsoDate(d.date), d]));
  const [y, mo] = ym.split("-").map(Number);

  // 창이 열릴 때만 폼 데이터를 만든다. 수정 중인 기록의 일수는 그 해 잔여에 되돌려 넣고 보여 준다.
  let dialog = null;
  if (dialogOpen) {
    const remainingByYear: Record<number, number> = {};
    for (const s of summaries) remainingByYear[s.year] = s.summary.remaining;
    const initial = editing
      ? {
          id: editing.id,
          type: editing.type,
          startIso: toIsoDate(editing.startDate),
          endIso: toIsoDate(editing.endDate),
          days: editing.days,
          manualDays: editing.manualDays,
          memo: editing.memo,
        }
      : undefined;
    if (initial) {
      const ey = Number(initial.startIso.slice(0, 4));
      remainingByYear[ey] = (remainingByYear[ey] ?? 0) + initial.days;
    }
    dialog = (
      <EntryDialog
        closeHref={here}
        description={
          owner.closedWeekdays.length > 0
            ? `쉬는 요일(${owner.closedWeekdays.map((d) => WEEKDAY_LABEL[d]).join("·")})과 공휴일은 차감에서 빠집니다.`
            : "공휴일은 차감에서 빠집니다."
        }
        closedWeekdays={owner.closedWeekdays}
        holidays={{ covered: payload?.covered ?? [], years: payload?.years ?? {} }}
        remainingByYear={remainingByYear}
        defaultDate={addDate ?? today}
        initial={initial}
      />
    );
  }

  const s = current.summary;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${y}.${String(mo).padStart(2, "0")}`}
        className="[&_h1]:font-mono [&_h1]:tabular-nums"
        action={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" render={<Link href={`/calendar?m=${shiftMonth(ym, -1)}`} />} nativeButton={false} aria-label="이전 달">
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" render={<Link href="/calendar" />} nativeButton={false}>
              오늘
            </Button>
            <Button variant="outline" size="icon-sm" render={<Link href={`/calendar?m=${shiftMonth(ym, 1)}`} />} nativeButton={false} aria-label="다음 달">
              <ChevronRight />
            </Button>
            <Button size="sm" render={<Link href={`${here}&add=${ym === today.slice(0, 7) ? today : first}`} scroll={false} />} nativeButton={false} className="ml-1">
              <CalendarPlus data-icon="inline-start" />
              기록
            </Button>
          </div>
        }
      />

      {/* 그 해 잔여 한 줄. 부여를 아직 안 적은 해는 설정으로 보낸다. */}
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>
          {year}년 잔여{" "}
          <span className={cn("font-mono text-lg font-semibold tabular-nums", s.remaining < 0 ? "text-destructive" : "text-primary")}>
            {formatDays(s.remaining)}
          </span>
        </span>
        <span>
          사용 <span className="font-mono tabular-nums text-foreground">{formatDays(s.used)}</span>
        </span>
        {current.missing ? (
          <Link href="/settings#years" className="text-amber-700 underline">
            {year}년 부여 입력
          </Link>
        ) : (
          <span>
            부여 <span className="font-mono tabular-nums text-foreground">{formatDays(s.granted)}</span>
            {s.carriedOver > 0 && (
              <>
                {" "}+ 이월 <span className="font-mono tabular-nums text-foreground">{formatDays(s.carriedOver)}</span>
              </>
            )}
          </span>
        )}
      </p>

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
              if (!d) {
                // 칸 전체를 덮는 추가 링크. 날짜 배지 아래 빈 자리를 채운다.
                return (
                  <Link
                    href={`${here}&add=${iso}`}
                    scroll={false}
                    aria-label={`${iso} 기록 추가`}
                    className="block h-full min-h-12 rounded hover:bg-primary/5"
                  />
                );
              }
              const half = d.type !== LeaveType.FULL_DAY;
              return (
                <Link
                  href={`${here}&entry=${d.entryId}`}
                  scroll={false}
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
            <span>날짜를 누르면 기록, 칩을 누르면 고치기</span>
          </div>
        </CardContent>
      </Card>

      {dialog}
    </div>
  );
}
