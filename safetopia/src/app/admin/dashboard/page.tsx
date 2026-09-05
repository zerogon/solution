import Link from "next/link";
import { CalendarOff, CalendarRange, ClipboardList, Store, Users } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { addDaysIso, formatKoMd, parseDate, todayKstIso } from "@/lib/utils";
import { LEAVE_TYPE_LABEL } from "@/lib/labels";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeaveRequestList } from "@/components/leave/LeaveRequestList";
import { AdminRequestActions } from "@/components/admin/AdminRequestActions";
import { BranchStatus, EmployeeStatus, Role } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const RECENT_LIMIT = 10;

/** 승인 절차가 없으므로 대시보드는 "처리할 것"이 아니라 "지금 상황"을 보여 준다. */
export default async function AdminDashboardPage() {
  const today = todayKstIso();
  const weekEnd = addDaysIso(today, 6);

  const [todayOff, weekOffCount, activeEmployees, activeBranches, recent] = await Promise.all([
    // LeaveRequestDay는 확정 건만 갖고 있으므로 상태 조건이 필요 없다.
    prisma.leaveRequestDay.findMany({
      where: { date: parseDate(today) },
      include: { user: { select: { name: true, branch: { select: { name: true } } } } },
      orderBy: { user: { branch: { name: "asc" } } },
    }),
    prisma.leaveRequestDay.count({ where: { date: { gte: parseDate(today), lte: parseDate(weekEnd) } } }),
    prisma.user.count({ where: { role: Role.EMPLOYEE, status: EmployeeStatus.ACTIVE } }),
    prisma.branch.count({ where: { status: BranchStatus.ACTIVE } }),
    prisma.leaveRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT_LIMIT,
      include: {
        user: { select: { name: true, branch: { select: { name: true } } } },
        cancelledBy: { select: { name: true } },
      },
    }),
  ]);

  const offByBranch = new Map<string, { name: string; type: string }[]>();
  for (const d of todayOff) {
    const key = d.user.branch?.name ?? "소속 없음";
    if (!offByBranch.has(key)) offByBranch.set(key, []);
    offByBranch.get(key)!.push({ name: d.user.name, type: LEAVE_TYPE_LABEL[d.type] });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="관리자 대시보드" description={`${formatKoMd(today)} 기준`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={CalendarOff} label="오늘 휴가자" value={todayOff.length} unit="명" />
        <StatCard icon={CalendarRange} label="이번 주 휴가" value={weekOffCount} unit="건" />
        <StatCard icon={Users} label="재직 직원" value={activeEmployees} unit="명" />
        <StatCard icon={Store} label="운영 지점" value={activeBranches} unit="곳" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
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

        <section className="space-y-3">
          <h2 className="font-heading text-lg font-semibold">오늘 휴가자</h2>
          <Card>
            <CardContent>
              {offByBranch.size === 0 ? (
                <EmptyState icon={CalendarOff} title="오늘 휴가자가 없습니다" />
              ) : (
                <dl className="space-y-3">
                  {Array.from(offByBranch.entries()).map(([branch, people]) => (
                    <div key={branch}>
                      <dt className="text-xs font-medium text-muted-foreground">{branch}</dt>
                      <dd className="mt-1 flex flex-wrap gap-1.5">
                        {people.map((p, i) => (
                          <span key={i} className="rounded-full bg-muted px-2.5 py-0.5 text-sm">
                            {p.name} <span className="text-xs text-muted-foreground">{p.type}</span>
                          </span>
                        ))}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">바로가기</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" render={<Link href="/admin/employees" />} nativeButton={false}>직원 관리</Button>
              <Button variant="outline" size="sm" render={<Link href="/admin/branches" />} nativeButton={false}>지점 관리</Button>
              <Button variant="outline" size="sm" render={<Link href="/admin/leaves" />} nativeButton={false}>연차 관리</Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
