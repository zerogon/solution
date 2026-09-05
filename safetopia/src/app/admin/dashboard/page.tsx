import Link from "next/link";
import { CalendarDays, CalendarOff, CalendarRange, ClipboardList, Store, Users } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { getHolidayOracle } from "@/lib/holidays-server";
import { summarize } from "@/lib/leave-balance";
import { buildScheduleBoard, rangeDays } from "@/lib/schedule-board";
import { addDaysIso, formatKoMd, parseDate, toIsoDate, todayKstIso } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LeaveRequestList } from "@/components/leave/LeaveRequestList";
import { AdminRequestActions } from "@/components/admin/AdminRequestActions";
import { LeaveScheduleBoard } from "@/components/admin/LeaveScheduleBoard";
import { BranchStatus, EmployeeStatus, Role } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

/** 보드 기간. 모바일은 앞 7일만 열로 보인다(`LeaveScheduleBoard`). */
const BOARD_DAYS = 14;
const RECENT_LIMIT = 5;

/**
 * 승인 절차가 없으므로 대시보드는 "처리할 것"이 아니라 "지금 상황"을 보여 준다 —
 * 본문은 지점별 직원×날짜 스케줄 보드(2주)이고 행 끝에 잔여 연차가 붙는다.
 */
export default async function AdminDashboardPage() {
  const today = todayKstIso();
  const weekEnd = addDaysIso(today, 6);
  const days = rangeDays(today, BOARD_DAYS);
  const year = Number(today.slice(0, 4));

  const [users, dayRows, todayOffCount, weekOffCount, activeBranches, recent, { oracle }] = await Promise.all([
    prisma.user.findMany({
      where: { role: Role.EMPLOYEE, status: EmployeeStatus.ACTIVE },
      orderBy: [{ branch: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        branch: { select: { id: true, name: true, closedWeekdays: true } },
        leaveBalances: { where: { year } },
      },
    }),
    // LeaveRequestDay는 확정 건만 갖고 있으므로 상태 조건이 필요 없다.
    prisma.leaveRequestDay.findMany({
      where: { date: { gte: parseDate(days[0]), lte: parseDate(days[days.length - 1]) } },
      select: { userId: true, date: true, type: true },
    }),
    prisma.leaveRequestDay.count({ where: { date: parseDate(today) } }),
    prisma.leaveRequestDay.count({ where: { date: { gte: parseDate(today), lte: parseDate(weekEnd) } } }),
    prisma.branch.count({ where: { status: BranchStatus.ACTIVE } }),
    prisma.leaveRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      include: {
        user: { select: { name: true, branch: { select: { name: true } } } },
        cancelledBy: { select: { name: true } },
      },
    }),
    getHolidayOracle(),
  ]);

  const groups = buildScheduleBoard({
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      branch: u.branch,
      summary: u.leaveBalances[0] ? summarize(u.leaveBalances[0]) : null,
    })),
    dayRows: dayRows.map((r) => ({ userId: r.userId, date: toIsoDate(r.date), type: r.type })),
    days,
  });
  const holidays = Object.fromEntries(
    days.map((iso) => [iso, oracle.covers(iso) && oracle.isHoliday(iso) ? oracle.nameOf(iso) : null]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="관리자 대시보드"
        description={`${formatKoMd(today)} 기준 · 앞으로 ${BOARD_DAYS}일`}
        action={
          <Button variant="outline" size="sm" render={<Link href="/admin/calendar" />} nativeButton={false}>
            <CalendarDays data-icon="inline-start" />
            전체 캘린더
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={CalendarOff} label="오늘 휴가자" value={todayOffCount} unit="명" />
        <StatCard icon={CalendarRange} label="이번 주 휴가" value={weekOffCount} unit="건" />
        <StatCard icon={Users} label="재직 직원" value={users.length} unit="명" />
        <StatCard icon={Store} label="운영 지점" value={activeBranches} unit="곳" />
      </div>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">지점별 휴가 일정</h2>
        <LeaveScheduleBoard days={days} today={today} groups={groups} holidays={holidays} />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">최근 신청</h2>
          <Button variant="ghost" size="sm" render={<Link href="/admin/leaves" />} nativeButton={false}>
            전체 보기
          </Button>
        </div>
        {recent.length === 0 ? (
          <Card>
            <CardContent>
              <EmptyState icon={ClipboardList} title="아직 신청이 없습니다" description="직원이 신청하면 최신순으로 여기에 표시됩니다." />
            </CardContent>
          </Card>
        ) : (
          <LeaveRequestList
            rows={recent}
            showUser
            renderAction={(r) => <AdminRequestActions id={r.id} status={r.status} compact />}
          />
        )}
      </section>
    </div>
  );
}
