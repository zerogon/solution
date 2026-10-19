import Link from "next/link";
import { CalendarPlus, Gift } from "lucide-react";

import { getEntries, getYearSummaries, monthlyUsage } from "@/lib/queries";
import { resolveYearParam } from "@/lib/calendar";
import { formatDays } from "@/lib/labels";
import { cn, todayKstIso } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LeaveEntryList } from "@/components/leave/LeaveEntryList";
import { YearSummaryCards } from "@/components/leave/YearSummaryCards";
import { YearTabs } from "@/components/leave/YearTabs";

export const dynamic = "force-dynamic";

/**
 * 연차 기록 — 엑셀 시트를 대체하는 화면. 연도 하나 = 시트 하나.
 * 위에서부터 요약 네 칸, 월별 사용 12칸, 기록 표.
 */
export default async function LeavesPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const { year: raw } = await searchParams;
  const today = todayKstIso();
  const year = resolveYearParam(raw, today);

  const [summaries, entries] = await Promise.all([getYearSummaries(year), getEntries(year)]);
  const current = summaries.find((s) => s.year === year)!;
  const months = monthlyUsage(entries);
  const thisMonth = year === Number(today.slice(0, 4)) ? Number(today.slice(5, 7)) - 1 : -1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="연차 기록"
        description={current.memo ?? `${year}년 1월 1일 ~ 12월 31일`}
        action={
          <Button render={<Link href={`/leaves/new?year=${year}`} />} nativeButton={false}>
            <CalendarPlus data-icon="inline-start" />
            기록 추가
          </Button>
        }
      />

      <YearTabs years={summaries.map((s) => s.year)} current={year} basePath="/leaves" />

      {current.missing && (
        <Alert variant="warning">
          <Gift />
          <AlertTitle>{year}년 부여 일수가 아직 없습니다</AlertTitle>
          <AlertDescription>
            <Link href="/settings#years" className="underline">설정</Link>에서 그 해에 받은 연차 일수를 입력하면 잔여가 계산됩니다.
          </AlertDescription>
        </Alert>
      )}

      <YearSummaryCards summary={current.summary} />

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">월별 사용</h2>
        <Card>
          <CardContent className="grid grid-cols-6 gap-px overflow-hidden rounded-lg p-0 sm:grid-cols-12">
            {months.map((d, i) => (
              <div
                key={i}
                className={cn("flex flex-col items-center gap-0.5 py-2.5", i === thisMonth && "bg-primary/5")}
              >
                <span className={cn("text-[11px] text-muted-foreground", i === thisMonth && "font-semibold text-primary")}>
                  {i + 1}월
                </span>
                <span className={cn("font-mono text-sm tabular-nums", d === 0 ? "text-muted-foreground/40" : "font-semibold")}>
                  {d === 0 ? "–" : d}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-heading text-lg font-semibold">기록</h2>
          <span className="text-xs text-muted-foreground">
            {entries.length}건 · 합계 <span className="font-mono tabular-nums">{formatDays(current.summary.used)}</span>
          </span>
        </div>
        <LeaveEntryList rows={entries} emptyTitle={`${year}년 기록이 없습니다`} />
        {entries.some((e) => e.manualDays) && (
          <p className="text-xs text-muted-foreground">* 일수를 직접 입력한 기록</p>
        )}
      </section>
    </div>
  );
}
