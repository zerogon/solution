import Link from "next/link";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";

import { requireOwner } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getHolidayOracle } from "@/lib/holidays-server";
import { getPeriodSummaries } from "@/lib/queries";
import { autoDaysForPeriod, formatPeriodLabel, nextAccrualIso, periodByIndex, periodIndexFor } from "@/lib/leave-accrual";
import { SHADED_DAY_CELL, monthBounds, resolveMonthParam, shiftMonth } from "@/lib/calendar";
import { LEAVE_TYPE_LABEL, WEEKDAY_LABEL, formatDays } from "@/lib/labels";
import { addDaysIso, cn, formatKoDate, formatKoMd, parseDate, toIsoDate, todayKstIso } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MonthGrid } from "@/components/month-grid";
import { EntryDialog } from "@/components/leave/EntryDialog";
import { YearEntryList } from "@/components/leave/YearEntryList";
import { LeaveType } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f-]{36}$/;

/**
 * 앱의 본 화면(2026-10-19 최소화 — 화면은 이것과 설정 둘뿐). 위에 그 회차 잔여 한 줄, 아래 월 달력.
 * 요약 회차 = 이번 달이면 오늘, 아니면 그 달 말일이 속한 회차(달 안에서 회차가 바뀌면 한 줄 힌트).
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
  const { first, last } = monthBounds(ym);
  const here = `/calendar?m=${ym}`;
  const { hireIso } = owner;
  const anchor = ym === today.slice(0, 7) ? today : last;
  const focusIndex = hireIso ? periodIndexFor(hireIso, anchor) : null;

  const editing = entryId && UUID_RE.test(entryId) ? await prisma.leaveEntry.findUnique({ where: { id: entryId } }) : null;
  const addDate = add && ISO_RE.test(add) ? add : null;
  const dialogOpen = Boolean(editing || addDate);

  const [days, yearEntries, summaries, { oracle, payload }] = await Promise.all([
    prisma.leaveEntryDay.findMany({
      where: { date: { gte: parseDate(first), lte: parseDate(last) } },
      include: { entry: { select: { memo: true } } },
    }),
    // 아래 그 해 목록용 — 해를 걸친 기록도 포함.
    prisma.leaveEntry.findMany({
      where: { startDate: { lte: parseDate(`${ym.slice(0, 4)}-12-31`) }, endDate: { gte: parseDate(`${ym.slice(0, 4)}-01-01`) } },
      orderBy: { startDate: "asc" },
    }),
    // 보는 달의 회차와 그 다음 회차는 반드시 포함 — 폼에서 다음 회차 날짜를 골라도 잔여가 나오게.
    hireIso && focusIndex != null ? getPeriodSummaries(hireIso, today, [focusIndex, focusIndex + 1]) : Promise.resolve([]),
    getHolidayOracle(),
  ]);

  const current = focusIndex == null ? null : (summaries.find((s) => s.index === focusIndex) ?? null);
  // 달 안에서 회차가 바뀌는 달(입사기념일이 든 달)은 새 회차를 한 줄 알려 준다.
  let periodHint: string | null = null;
  if (hireIso) {
    const lastIndex = periodIndexFor(hireIso, last);
    if (lastIndex >= 1 && periodIndexFor(hireIso, first) !== lastIndex) {
      const next = periodByIndex(hireIso, lastIndex);
      periodHint = `${formatKoMd(next.startIso)}부터 ${lastIndex}년차 · 발생 ${formatDays(autoDaysForPeriod(hireIso, next, next.startIso))}`;
    }
  }
  const nextAccrual = hireIso && current?.period?.index === 1 && !current.upcoming ? nextAccrualIso(hireIso, today) : null;
  const byDate = new Map(days.map((d) => [toIsoDate(d.date), d]));
  const [y, mo] = ym.split("-").map(Number);

  // 창이 열릴 때만 폼 데이터를 만든다. 수정 중인 기록의 일수는 그 회차 잔여에 되돌려 넣고 보여 준다.
  let dialog = null;
  if (dialogOpen) {
    const remainingByPeriod: Record<number, number> = {};
    for (const s of summaries) remainingByPeriod[s.index] = s.summary.remaining;
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
    if (initial && hireIso) {
      const idx = periodIndexFor(hireIso, initial.startIso);
      remainingByPeriod[idx] = (remainingByPeriod[idx] ?? 0) + initial.days;
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
        hireIso={hireIso}
        remainingByPeriod={remainingByPeriod}
        defaultDate={addDate ?? today}
        initial={initial}
      />
    );
  }

  const s = current?.summary ?? null;
  const num = "font-mono tabular-nums text-foreground";

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
              연차 등록
            </Button>
          </div>
        }
      />

      {/* 그 회차 잔여 한 줄. 입사일이 없으면 설정으로 보낸다. */}
      {!hireIso ? (
        <p className="text-sm text-muted-foreground">
          <Link href="/settings" className="text-amber-700 underline">
            입사일을 입력
          </Link>
          하면 근로기준법에 따라 연차가 자동으로 발생합니다. 등록은 지금도 할 수 있습니다.
        </p>
      ) : !current || !current.period || !s ? (
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="text-foreground">입사 전</span>
          {s && (
            <span>
              등록 <span className={num}>{formatDays(s.used)}</span>
            </span>
          )}
          {periodHint && <span className="text-amber-700">{periodHint}</span>}
        </p>
      ) : (
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="break-keep text-foreground">{formatPeriodLabel(current.period)}</span>
          <span>
            잔여{" "}
            <span className={cn("font-mono text-lg font-semibold tabular-nums", s.remaining < 0 ? "text-destructive" : "text-primary")}>
              {formatDays(s.remaining)}
            </span>
          </span>
          <span>
            사용 <span className={num}>{formatDays(s.used)}</span>
          </span>
          <span>
            {current.upcoming ? "발생 예정" : "발생"} <span className={num}>{formatDays(s.granted)}</span>
            {s.carriedOver > 0 && (
              <>
                {" "}+ 이월 <span className={num}>{formatDays(s.carriedOver)}</span>
              </>
            )}
            {s.adjusted !== 0 && (
              <>
                {" "}· 보정 <span className={num}>{s.adjusted > 0 ? "+" : "−"}{formatDays(Math.abs(s.adjusted))}</span>
              </>
            )}
          </span>
          {nextAccrual && (
            <span>
              다음 발생 <span className={num}>{formatKoDate(nextAccrual.iso)}</span> +{formatDays(nextAccrual.days)}
            </span>
          )}
          {periodHint && <span className="text-amber-700">{periodHint}</span>}
        </p>
      )}

      {/* 모바일·태블릿은 달력 아래, 넓은 화면(xl)은 달력 오른쪽에 그 해 목록. */}
      <div className="space-y-4 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:gap-4 xl:space-y-0">
        <Card>
          <CardContent className="p-2 sm:p-4">
            <MonthGrid
              ym={ym}
              today={today}
              oracle={oracle}
              closedWeekdays={owner.closedWeekdays}
              cellClassName="min-h-20 sm:min-h-28"
              renderDay={(iso) => {
                const d = byDate.get(iso);
                if (!d) {
                  // 칸 전체를 덮는 추가 링크. 날짜 배지 아래 빈 자리를 채운다.
                  return (
                    <Link
                      href={`${here}&add=${iso}`}
                      scroll={false}
                      aria-label={`${iso} 연차 등록`}
                      className="block h-full min-h-12 rounded hover:bg-primary/5"
                    />
                  );
                }
                const half = d.type !== LeaveType.FULL_DAY;
                // 여러 날 기록은 띠로 잇는다 — 옆 칸이 같은 기록이면 그쪽 모서리를 펴고 셀 패딩만큼 늘인다.
                // 주가 바뀌는 칸(일·토)에서는 끊고, 라벨은 띠의 첫 칸에만 쓴다.
                const dow = parseDate(iso).getUTCDay();
                const joinPrev = dow !== 0 && byDate.get(addDaysIso(iso, -1))?.entryId === d.entryId;
                const joinNext = dow !== 6 && byDate.get(addDaysIso(iso, 1))?.entryId === d.entryId;
                return (
                  <Link
                    href={`${here}&entry=${d.entryId}`}
                    scroll={false}
                    className={cn(
                      "mt-1 block rounded px-1.5 py-1 text-xs leading-tight",
                      half
                        ? "border-l-2 border-primary bg-primary/10 text-foreground"
                        : "bg-primary text-primary-foreground hover:bg-primary/90",
                      joinPrev && "-ml-1 rounded-l-none sm:-ml-1.5",
                      joinNext && "-mr-1 rounded-r-none sm:-mr-1.5",
                    )}
                    title={[LEAVE_TYPE_LABEL[d.type], d.entry.memo].filter(Boolean).join(" · ")}
                  >
                    {/* 이어지는 칸도 같은 내용을 숨겨 그린다 — 띠 높이가 첫 칸(메모 줄)과 맞게. */}
                    <span className={cn("block", joinPrev && "invisible")} aria-hidden={joinPrev || undefined}>
                      <span className="block font-semibold">{half ? (d.type === LeaveType.AM_HALF ? "오전" : "오후") : "연차"}</span>
                      {/* line-clamp가 display를 쓰므로 hidden과 한 요소에 두지 않는다. */}
                      {d.entry.memo && (
                        <span className="mt-0.5 hidden opacity-90 sm:block">
                          <span className="line-clamp-2 break-keep">{d.entry.memo}</span>
                        </span>
                      )}
                    </span>
                  </Link>
                );
              }}
            />
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm bg-primary" />연차</span>
              <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded-sm border-l-2 border-primary bg-primary/10" />반차</span>
              <span className="inline-flex items-center gap-1"><span className={cn("h-2.5 w-4 rounded-sm ring-1 ring-border", SHADED_DAY_CELL)} />주말·쉬는 요일·공휴일</span>
              <span>날짜를 누르면 등록, 칩을 누르면 고치기</span>
            </div>
          </CardContent>
        </Card>

        <YearEntryList
          year={y}
          ym={ym}
          entries={yearEntries.map((e) => ({
            id: e.id,
            type: e.type,
            startIso: toIsoDate(e.startDate),
            endIso: toIsoDate(e.endDate),
            days: e.days,
            manualDays: e.manualDays,
            memo: e.memo,
          }))}
        />
      </div>

      {dialog}
    </div>
  );
}
