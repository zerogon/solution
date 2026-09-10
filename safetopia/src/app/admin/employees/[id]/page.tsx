import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { EMPLOYEE_STATUS_LABEL, ROLE_LABEL } from "@/lib/labels";
import { getPeriodRows } from "@/lib/queries";
import { formatPeriodLabel } from "@/lib/leave-accrual";
import { formatKstDateTime, toIsoDate, todayKstIso } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { EmployeeEditForm } from "@/components/admin/EmployeeEditForm";
import { DeleteEmployeeDialog, EmployeeStatusSelect, ResetPasswordButton } from "@/components/admin/EmployeeControls";
import { AdjustLeaveDialog, GrantLeaveDialog } from "@/components/admin/BalanceDialogs";
import { LeaveRequestList } from "@/components/leave/LeaveRequestList";
import { AdminRequestActions } from "@/components/admin/AdminRequestActions";
import { BranchStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const today = todayKstIso();

  const [user, branches] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: {
        branch: { select: { id: true, name: true } },
        adjustments: { orderBy: { createdAt: "desc" }, take: 20, include: { createdBy: { select: { name: true } } } },
        leaveRequests: {
          orderBy: { createdAt: "desc" },
          take: 30,
          include: { cancelledBy: { select: { name: true } } },
        },
      },
    }),
    prisma.branch.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, status: true } }),
  ]);
  if (!user) notFound();

  // 비활성 지점은 고를 수 없지만, 이미 그 지점 소속이라면 목록에 남겨야 한다 —
  // 빠지면 셀렉트가 빈 값으로 열려 저장 한 번에 소속이 날아간다.
  const branchOptions = branches
    .filter((b) => b.status === BranchStatus.ACTIVE || b.id === user.branchId)
    .map((b) => ({ id: b.id, name: b.name }));

  // 저장된 회차 행 + 아직 행이 없는 현재 회차. 입사일이 없으면 빈 배열이다.
  const periods = await getPeriodRows(user, today);
  const isSelf = session?.user.id === user.id;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {user.name}
            <Badge variant="outline">{ROLE_LABEL[user.role]}</Badge>
            <Badge variant="secondary">{EMPLOYEE_STATUS_LABEL[user.status]}</Badge>
          </span>
        }
        description={
          <span className="font-mono text-xs">
            {user.loginId} · {user.branch?.name ?? "소속 없음"}
            {user.hireDate && ` · 입사 ${toIsoDate(user.hireDate)}`}
          </span>
        }
        action={
          <Button variant="ghost" size="sm" render={<Link href="/admin/employees" />} nativeButton={false}>
            <ArrowLeft data-icon="inline-start" />
            목록
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* 좌: 기본 정보 + 연차 */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>기본 정보</CardTitle>
            </CardHeader>
            <CardContent>
              <EmployeeEditForm
                branches={branchOptions}
                user={{
                  id: user.id,
                  name: user.name,
                  role: user.role,
                  branchId: user.branchId,
                  hireDate: user.hireDate ? toIsoDate(user.hireDate) : null,
                  isSelf,
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>연차</CardTitle>
              <CardDescription>입사일 기준 회차별 부여·사용·잔여</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {periods.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  입사일이 등록되지 않아 연차 회차를 계산할 수 없습니다. 위에서 입사일을 입력해주세요.
                </p>
              )}
              {periods.map((p) => (
                <div key={p.id ?? "current"} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-heading font-semibold">
                        {p.legacyYear !== null ? `${p.legacyYear}년(이전 기준)` : formatPeriodLabel(p.period)}
                      </span>
                      {p.legacyYear === null && (
                        <Badge variant={p.manual ? "outline" : "secondary"}>{p.manual ? "수동" : "자동"}</Badge>
                      )}
                    </div>
                    {/* 전환 이전의 캘린더 연도 행은 회차가 정의되지 않아 수정 대상이 아니다. */}
                    {p.legacyYear === null && (
                      <div className="flex gap-1.5">
                        <GrantLeaveDialog
                          userId={user.id}
                          periodIndex={p.period.index}
                          periodLabel={formatPeriodLabel(p.period)}
                          autoDays={p.autoDays}
                          initial={p.id ? { totalDays: p.manual ? p.granted : null, carriedOverDays: p.carriedOverDays } : undefined}
                        />
                        <AdjustLeaveDialog
                          userId={user.id}
                          periodIndex={p.period.index}
                          periodLabel={formatPeriodLabel(p.period)}
                        />
                      </div>
                    )}
                  </div>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-center sm:grid-cols-5">
                    {[
                      ["부여", p.granted],
                      ["이월", p.carriedOverDays],
                      ["조정", p.adjustedDays],
                      ["사용", p.summary.used],
                      ["잔여", p.summary.remaining],
                    ].map(([label, v]) => (
                      <div key={label as string} className="rounded-md bg-muted/50 py-1.5">
                        <dt className="text-[11px] text-muted-foreground">{label}</dt>
                        <dd className="font-mono text-sm font-semibold tabular-nums">{v as number}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}

              {user.adjustments.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-muted-foreground">조정 이력</div>
                    <ul className="space-y-1 text-sm">
                      {user.adjustments.map((a) => (
                        <li key={a.id} className="flex items-baseline gap-2">
                          <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatKstDateTime(a.createdAt)}</span>
                          <span className="font-mono tabular-nums">{a.periodIndex}년차 {a.amount > 0 ? "+" : ""}{a.amount}</span>
                          <span className="min-w-0 flex-1 truncate text-foreground/80">{a.reason}</span>
                          <span className="text-xs text-muted-foreground">{a.createdBy?.name ?? "—"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 우: 관리 */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>계정 관리</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">재직 상태</div>
                <EmployeeStatusSelect id={user.id} status={user.status} isSelf={isSelf} />
                {isSelf && <p className="text-xs text-muted-foreground">본인 계정의 상태는 변경할 수 없습니다.</p>}
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">비밀번호</div>
                <ResetPasswordButton userId={user.id} userName={user.name} />
                {user.mustChangePassword && (
                  <p className="text-xs text-amber-700">아직 초기 비밀번호를 변경하지 않았습니다.</p>
                )}
              </div>
              <Separator />
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">직원 삭제</div>
                <DeleteEmployeeDialog userId={user.id} userName={user.name} isSelf={isSelf} />
                <p className="text-xs text-muted-foreground">
                  {isSelf
                    ? "본인 계정은 삭제할 수 없습니다."
                    : "기록을 남겨야 한다면 삭제 대신 재직 상태를 '퇴사'로 바꾸세요."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">신청 이력</h2>
        <LeaveRequestList
          rows={user.leaveRequests}
          renderAction={(r) => <AdminRequestActions id={r.id} status={r.status} compact />}
        />
      </section>
    </div>
  );
}
