import Link from "next/link";
import { ChevronRight, Plus, Users } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { EMPLOYEE_STATUS_LABEL, ROLE_LABEL, formatDays } from "@/lib/labels";
import { summarize } from "@/lib/leave-balance";
import { cn, toIsoDate } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmployeeFormDialog } from "@/components/admin/EmployeeFormDialog";
import { BranchStatus, EmployeeStatus, Role } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "ACTIVE", label: "재직" },
  { value: "ALL", label: "전체" },
  { value: "INACTIVE", label: "휴직" },
  { value: "RETIRED", label: "퇴사" },
];

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: statusParam = "ACTIVE" } = await searchParams;
  const statusFilter =
    statusParam === "ALL" ? undefined : (Object.values(EmployeeStatus) as string[]).includes(statusParam)
      ? (statusParam as EmployeeStatus)
      : EmployeeStatus.ACTIVE;
  const year = new Date().getUTCFullYear();

  const [users, branches] = await Promise.all([
    prisma.user.findMany({
      where: statusFilter ? { status: statusFilter } : undefined,
      orderBy: [{ role: "asc" }, { branch: { name: "asc" } }, { name: "asc" }],
      include: {
        branch: { select: { name: true } },
        leaveBalances: { where: { year } },
      },
    }),
    prisma.branch.findMany({ where: { status: BranchStatus.ACTIVE }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const rows = users.map((u) => {
    const balance = u.leaveBalances[0];
    const summary = balance ? summarize(balance) : null;
    return { ...u, summary };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="직원 관리"
        description="직원을 등록하고 소속·재직 상태·연차를 관리합니다."
        action={
          <EmployeeFormDialog
            branches={branches}
            trigger={
              <Button>
                <Plus data-icon="inline-start" />
                직원 등록
              </Button>
            }
          />
        }
      />

      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => {
          const active = f.value === statusParam || (f.value === "ACTIVE" && statusParam === "ACTIVE");
          return (
            <Link
              key={f.value}
              href={f.value === "ACTIVE" ? "/admin/employees" : `/admin/employees?status=${f.value}`}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={Users} title="해당하는 직원이 없습니다" />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 모바일: 카드 */}
          <ul className="space-y-2 md:hidden">
            {rows.map((u) => (
              <li key={u.id}>
                <Link href={`/admin/employees/${u.id}`} className="block">
                  <Card className="transition-colors hover:bg-muted/40">
                    <CardContent className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{u.name}</span>
                          <span className="font-mono text-xs text-muted-foreground">{u.loginId}</span>
                          {u.role === Role.ADMIN && <Badge variant="outline">{ROLE_LABEL[u.role]}</Badge>}
                          {u.status !== EmployeeStatus.ACTIVE && (
                            <Badge variant="secondary">{EMPLOYEE_STATUS_LABEL[u.status]}</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {u.branch?.name ?? "소속 없음"}
                          {u.hireDate && ` · 입사 ${toIsoDate(u.hireDate)}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] text-muted-foreground">잔여</div>
                        <div className="font-mono text-base font-semibold tabular-nums">
                          {u.summary ? formatDays(u.summary.remaining) : "—"}
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>

          {/* 데스크톱: 테이블 */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>이름</TableHead>
                    <TableHead>아이디</TableHead>
                    <TableHead>권한</TableHead>
                    <TableHead>지점</TableHead>
                    <TableHead>입사일</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead className="text-right">{year} 총</TableHead>
                    <TableHead className="text-right">사용</TableHead>
                    <TableHead className="text-right">잔여</TableHead>
                    <TableHead className="w-0" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((u) => (
                    <TableRow key={u.id} className={cn(u.status !== EmployeeStatus.ACTIVE && "opacity-60")}>
                      <TableCell className="font-medium">
                        <Link href={`/admin/employees/${u.id}`} className="hover:underline">
                          {u.name}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{u.loginId}</TableCell>
                      <TableCell>{ROLE_LABEL[u.role]}</TableCell>
                      <TableCell>{u.branch?.name ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs tabular-nums">{u.hireDate ? toIsoDate(u.hireDate) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant={u.status === EmployeeStatus.ACTIVE ? "secondary" : "outline"}>
                          {EMPLOYEE_STATUS_LABEL[u.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{u.summary ? u.summary.total : "—"}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">{u.summary ? u.summary.used : "—"}</TableCell>
                      <TableCell className="text-right font-mono font-semibold tabular-nums">{u.summary ? u.summary.remaining : "—"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon-sm" render={<Link href={`/admin/employees/${u.id}`} />} nativeButton={false} aria-label="상세">
                          <ChevronRight />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
