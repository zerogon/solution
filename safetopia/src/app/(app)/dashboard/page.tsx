import Link from "next/link";
import { CalendarPlus, CalendarRange, ChevronRight, Gift } from "lucide-react";

import { requireOwner } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getYearSummary } from "@/lib/queries";
import { LEAVE_TYPE_LABEL, formatDays } from "@/lib/labels";
import { formatKoRange, parseDate, toIsoDate, todayKstIso } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LeaveEntryList } from "@/components/leave/LeaveEntryList";
import { YearSummaryCards } from "@/components/leave/YearSummaryCards";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const owner = await requireOwner();
  const today = todayKstIso();
  const year = Number(today.slice(0, 4));

  const [current, upcoming, recent] = await Promise.all([
    getYearSummary(year),
    prisma.leaveEntry.findMany({
      where: { endDate: { gte: parseDate(today) } },
      orderBy: { startDate: "asc" },
      take: 3,
    }),
    prisma.leaveEntry.findMany({ orderBy: { updatedAt: "desc" }, take: 5 }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`안녕하세요, ${owner.name}님`}
        description={`${year}년 연차 현황`}
        action={
          <Button render={<Link href="/leaves/new" />} nativeButton={false}>
            <CalendarPlus data-icon="inline-start" />
            기록 추가
          </Button>
        }
      />

      {current.missing && (
        <Alert variant="warning">
          <Gift />
          <AlertTitle>{year}년 부여 일수를 입력해주세요</AlertTitle>
          <AlertDescription>
            <Link href="/settings#years" className="underline">설정</Link>에 올해 받은 연차 일수를 적으면 잔여가 계산됩니다.
          </AlertDescription>
        </Alert>
      )}

      <YearSummaryCards summary={current.summary} />

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">다가오는 휴가</h2>
        {upcoming.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState icon={CalendarRange} title="예정된 휴가가 없습니다" />
            </CardContent>
          </Card>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-3">
            {upcoming.map((r) => (
              <li key={r.id}>
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="py-3">
                    <div className="font-mono text-base font-semibold tabular-nums">
                      {formatKoRange(toIsoDate(r.startDate), toIsoDate(r.endDate))}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {LEAVE_TYPE_LABEL[r.type]} · {formatDays(r.days)}
                      {r.memo && ` · ${r.memo}`}
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">최근 기록</h2>
          <Button variant="ghost" size="sm" render={<Link href="/leaves" />} nativeButton={false}>
            전체 기록
            <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
        <LeaveEntryList rows={recent} editable={false} emptyTitle="아직 기록이 없습니다" />
      </section>
    </div>
  );
}
