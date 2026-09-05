import Link from "next/link";
import { AlertTriangle, Store } from "lucide-react";

import { requireActiveUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getBalanceSummary } from "@/lib/queries";
import { getHolidayOracle } from "@/lib/holidays-server";
import { formatDays, WEEKDAY_LABEL } from "@/lib/labels";
import { todayKstIso } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { LeaveRequestForm } from "@/components/leave/LeaveRequestForm";

export const dynamic = "force-dynamic";

export default async function LeaveRequestPage() {
  const { user } = await requireActiveUser();
  const today = todayKstIso();
  const year = Number(today.slice(0, 4));

  const [branch, summary, { payload }] = await Promise.all([
    user.branchId
      ? prisma.branch.findUnique({ where: { id: user.branchId }, select: { name: true, closedWeekdays: true } })
      : null,
    getBalanceSummary(user.id, year),
    getHolidayOracle(),
  ]);

  const blocker = !branch
    ? { title: "소속 지점이 없습니다", body: "관리자가 지점을 배정하면 신청할 수 있습니다." }
    : !summary
      ? { title: `${year}년 연차가 아직 부여되지 않았습니다`, body: "관리자에게 연차 부여를 요청하세요." }
      : null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader
        title="연차 신청"
        description={
          branch ? (
            <>
              {branch.name}
              {branch.closedWeekdays.length > 0
                ? ` · 매주 ${branch.closedWeekdays.map((d) => WEEKDAY_LABEL[d]).join("·")} 휴무`
                : " · 휴무 없음"}
              {summary && (
                <>
                  {" · 잔여 "}
                  <span className="font-mono font-semibold text-foreground tabular-nums">{formatDays(summary.remaining)}</span>
                </>
              )}
            </>
          ) : undefined
        }
      />

      {blocker ? (
        <Alert variant="warning">
          <Store />
          <AlertTitle>{blocker.title}</AlertTitle>
          <AlertDescription>
            {blocker.body} <Link href="/dashboard" className="underline">대시보드로</Link>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {!payload && (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertTitle>공휴일 정보를 불러오지 못했습니다</AlertTitle>
              <AlertDescription>
                공휴일을 확인할 수 없는 동안에는 신청이 막힙니다. 잠시 후 새로고침해주세요.
              </AlertDescription>
            </Alert>
          )}
          {payload?.stale && (
            <p className="text-xs text-muted-foreground">공휴일 정보가 최신이 아닐 수 있습니다(캐시본 사용 중).</p>
          )}
          <Card>
            <CardContent className="pt-5">
              <LeaveRequestForm
                closedWeekdays={branch!.closedWeekdays}
                holidays={{ covered: payload?.covered ?? [], years: payload?.years ?? {} }}
                remaining={summary!.remaining}
                todayIso={today}
              />
            </CardContent>
          </Card>
          <p className="text-xs text-muted-foreground">
            지점 휴무일과 법정공휴일은 차감에서 자동 제외됩니다. 주말은 지점 휴무 요일로 지정된 경우에만 제외됩니다.
          </p>
        </>
      )}
    </div>
  );
}
