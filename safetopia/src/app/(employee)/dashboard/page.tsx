import Link from "next/link";
import { CalendarPlus, CalendarRange, ChevronRight, Clock, Gift, PlaneTakeoff } from "lucide-react";

import { requireActiveUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getCurrentBalance } from "@/lib/queries";
import { formatPeriodLabel, nextAccrualIso } from "@/lib/leave-accrual";
import { formatDays } from "@/lib/labels";
import { formatKoDate, formatKoRange, parseDate, toIsoDate, todayKstIso } from "@/lib/utils";
import { LEAVE_TYPE_LABEL } from "@/lib/labels";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LeaveRequestList } from "@/components/leave/LeaveRequestList";
import { CancelRequestButton } from "@/components/leave/CancelRequestButton";
import { LeaveStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

function NextAccrual({ hireIso, today }: { hireIso: string; today: string }) {
  const next = nextAccrualIso(hireIso, today);
  return (
    <p className="text-sm text-muted-foreground">
      다음 발생{" "}
      <span className="font-mono tabular-nums text-foreground">{formatKoDate(next.iso)}</span>
      {" · "}
      <span className="font-mono tabular-nums text-foreground">+{formatDays(next.days)}</span>
    </p>
  );
}

export default async function DashboardPage() {
  const { user } = await requireActiveUser();
  const today = todayKstIso();

  const [balance, upcoming, recent] = await Promise.all([
    getCurrentBalance(user, today),
    prisma.leaveRequest.findMany({
      where: { userId: user.id, status: LeaveStatus.CONFIRMED, endDate: { gte: parseDate(today) } },
      orderBy: { startDate: "asc" },
      take: 3,
    }),
    prisma.leaveRequest.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { cancelledBy: { select: { name: true } } },
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`안녕하세요, ${user.name}님`}
        description={balance ? formatPeriodLabel(balance.period) : "연차 현황"}
        action={
          <Button render={<Link href="/leave/request" />} nativeButton={false}>
            <CalendarPlus data-icon="inline-start" />
            연차 신청
          </Button>
        }
      />

      {balance ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard icon={PlaneTakeoff} label="잔여" value={balance.summary.remaining} unit="일" valueClassName="text-primary" />
            <StatCard icon={Clock} label="사용" value={balance.summary.used} unit="일" />
            <StatCard icon={Gift} label="총 보유" value={balance.summary.total} unit="일" />
          </div>
          {/* 1년 미만은 매달 하루씩 붙는다 — 언제 얼마가 느는지 보여야 잔여가 이해된다. */}
          {balance.period.index === 1 && <NextAccrual hireIso={toIsoDate(user.hireDate!)} today={today} />}
        </>
      ) : (
        <Alert variant="warning">
          <Gift />
          <AlertTitle>입사일이 등록되지 않았습니다</AlertTitle>
          <AlertDescription>연차는 입사일을 기준으로 계산됩니다. 관리자에게 입사일 등록을 요청하세요.</AlertDescription>
        </Alert>
      )}

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
                    <div className="text-xs text-muted-foreground">
                      {LEAVE_TYPE_LABEL[r.type]}{/* 연차 사유 비활성: · {r.reason} */}
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
          <h2 className="font-heading text-lg font-semibold">최근 신청</h2>
          <Button variant="ghost" size="sm" render={<Link href="/leave/history" />} nativeButton={false}>
            전체 내역
            <ChevronRight data-icon="inline-end" />
          </Button>
        </div>
        <LeaveRequestList
          rows={recent}
          renderAction={(r) =>
            r.status === LeaveStatus.CONFIRMED && toIsoDate(r.startDate) >= today ? <CancelRequestButton id={r.id} /> : null
          }
        />
      </section>
    </div>
  );
}
