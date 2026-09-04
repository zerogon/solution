import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { getBalanceSummaries } from "@/lib/queries";
import { cn, parseDate, todayKstIso } from "@/lib/utils";
import { formatDays } from "@/lib/labels";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LeaveRequestList } from "@/components/leave/LeaveRequestList";
import { AdminRequestActions } from "@/components/admin/AdminRequestActions";
import { LeaveFilterBar } from "@/components/admin/LeaveFilterBar";
import { EmployeeStatus, LeaveStatus, Role } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

type SP = { tab?: string; year?: string; branch?: string; status?: string };

export default async function AdminLeavesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const thisYear = Number(todayKstIso().slice(0, 4));
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : thisYear;
  const tab = sp.tab === "summary" ? "summary" : "requests";
  const status = (Object.values(LeaveStatus) as string[]).includes(sp.status ?? "") ? (sp.status as LeaveStatus) : undefined;
  const branch = sp.branch || "";
  const yearRange = { gte: parseDate(`${year}-01-01`), lte: parseDate(`${year}-12-31`) };

  const [branches, yearRows] = await Promise.all([
    prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.leaveBalance.findMany({ distinct: ["year"], select: { year: true }, orderBy: { year: "desc" } }),
  ]);
  const years = Array.from(new Set([thisYear, ...yearRows.map((r) => r.year)])).sort((a, b) => b - a);

  const tabHref = (t: string) => {
    const q = new URLSearchParams();
    if (t === "summary") q.set("tab", "summary");
    if (year !== thisYear) q.set("year", String(year));
    if (branch) q.set("branch", branch);
    if (status && t !== "summary") q.set("status", status);
    const s = q.toString();
    return `/admin/leaves${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader title="연차 관리" description="전체 신청을 처리하고 직원별 연차 현황을 확인합니다." />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-muted p-[3px]">
          {[
            ["requests", "신청 목록"],
            ["summary", "직원별 현황"],
          ].map(([t, label]) => (
            <Link
              key={t}
              href={tabHref(t)}
              className={cn(
                "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </div>
        <LeaveFilterBar branches={branches} years={years} current={{ branch, status: status ?? "", year }} />
      </div>

      {tab === "requests" ? (
        <RequestsTab year={yearRange} branch={branch} status={status} />
      ) : (
        <SummaryTab year={year} branch={branch} />
      )}
    </div>
  );
}

async function RequestsTab({ year, branch, status }: { year: { gte: Date; lte: Date }; branch: string; status?: LeaveStatus }) {
  const rows = await prisma.leaveRequest.findMany({
    where: {
      startDate: year,
      status,
      user: branch ? { branchId: branch } : undefined,
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      user: { select: { name: true, branch: { select: { name: true } } } },
      approvedBy: { select: { name: true } },
    },
  });
  return (
    <LeaveRequestList
      rows={rows}
      showUser
      emptyTitle="조건에 맞는 신청이 없습니다"
      renderAction={(r) => <AdminRequestActions id={r.id} status={r.status} compact />}
    />
  );
}

async function SummaryTab({ year, branch }: { year: number; branch: string }) {
  const users = await prisma.user.findMany({
    where: { role: Role.EMPLOYEE, status: EmployeeStatus.ACTIVE, branchId: branch || undefined },
    orderBy: [{ branch: { name: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, branch: { select: { name: true } } },
  });
  const summaries = await getBalanceSummaries(
    users.map((u) => u.id),
    year,
  );

  return (
    <>
      <ul className="space-y-2 md:hidden">
        {users.map((u) => {
          const s = summaries.get(u.id);
          return (
            <li key={u.id}>
              <Link href={`/admin/employees/${u.id}`}>
                <Card>
                  <CardContent className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.branch?.name ?? "소속 없음"}</div>
                    </div>
                    {s ? (
                      <div className="text-right text-xs text-muted-foreground">
                        <div>
                          총 {s.total} · 사용 {s.used} · 대기 {s.pending}
                        </div>
                        <div className="font-mono text-base font-semibold text-foreground tabular-nums">{formatDays(s.available)}</div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">미부여</span>
                    )}
                  </CardContent>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>직원</TableHead>
                <TableHead>지점</TableHead>
                <TableHead className="text-right">총 보유</TableHead>
                <TableHead className="text-right">사용</TableHead>
                <TableHead className="text-right">대기</TableHead>
                <TableHead className="text-right">실제 잔여</TableHead>
                <TableHead className="text-right">신청 가능</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const s = summaries.get(u.id);
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      <Link href={`/admin/employees/${u.id}`} className="hover:underline">
                        {u.name}
                      </Link>
                    </TableCell>
                    <TableCell>{u.branch?.name ?? "—"}</TableCell>
                    {s ? (
                      <>
                        <TableCell className="text-right font-mono tabular-nums">{s.total}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{s.used}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{s.pending}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">{s.remaining}</TableCell>
                        <TableCell className="text-right font-mono font-semibold tabular-nums">{s.available}</TableCell>
                      </>
                    ) : (
                      <TableCell colSpan={5} className="text-right text-xs text-muted-foreground">
                        {year}년 미부여
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
