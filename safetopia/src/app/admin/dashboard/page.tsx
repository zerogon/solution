import Link from "next/link";
import { CalendarOff, ClipboardCheck, Inbox, Store, Users } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { getPendingRequests } from "@/lib/pending-requests";
import { formatKoMd, parseDate, todayKstIso } from "@/lib/utils";
import { LEAVE_TYPE_LABEL } from "@/lib/labels";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PendingRequestCard } from "@/components/admin/PendingRequestCard";
import { BranchStatus, EmployeeStatus, LeaveStatus, Role } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const today = todayKstIso();

  const [pendingCount, todayOff, activeEmployees, activeBranches, pending] = await Promise.all([
    prisma.leaveRequest.count({ where: { status: LeaveStatus.PENDING } }),
    prisma.leaveRequestDay.findMany({
      where: { date: parseDate(today), leaveRequest: { status: LeaveStatus.APPROVED } },
      include: { user: { select: { name: true, branch: { select: { name: true } } } } },
      orderBy: { user: { branch: { name: "asc" } } },
    }),
    prisma.user.count({ where: { role: Role.EMPLOYEE, status: EmployeeStatus.ACTIVE } }),
    prisma.branch.count({ where: { status: BranchStatus.ACTIVE } }),
    getPendingRequests(10),
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
        <StatCard icon={Inbox} label="승인 대기" value={pendingCount} unit="건" valueClassName={pendingCount > 0 ? "text-amber-700" : undefined} />
        <StatCard icon={CalendarOff} label="오늘 휴가자" value={todayOff.length} unit="명" />
        <StatCard icon={Users} label="재직 직원" value={activeEmployees} unit="명" />
        <StatCard icon={Store} label="운영 지점" value={activeBranches} unit="곳" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold">승인 대기</h2>
            {pendingCount > pending.length && (
              <Button variant="ghost" size="sm" render={<Link href="/admin/leaves?status=PENDING" />} nativeButton={false}>
                전체 {pendingCount}건 보기
              </Button>
            )}
          </div>
          {pending.length === 0 ? (
            <Card>
              <CardContent>
                <EmptyState icon={ClipboardCheck} title="처리할 신청이 없습니다" description="새 신청이 들어오면 여기에 오래된 순으로 표시됩니다." />
              </CardContent>
            </Card>
          ) : (
            <ul className="space-y-2">
              {pending.map((r) => (
                <li key={r.id}>
                  <PendingRequestCard r={r} />
                </li>
              ))}
            </ul>
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
