import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, History } from "lucide-react";

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
import { BranchChangeDialog, EmployeeStatusSelect, ResetPasswordButton } from "@/components/admin/EmployeeControls";
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
        branchHistories: {
          orderBy: { changedAt: "desc" },
          include: { fromBranch: { select: { name: true } }, toBranch: { select: { name: true } }, changedBy: { select: { name: true } } },
        },
        leaveRequests: {
          orderBy: { createdAt: "desc" },
          take: 30,
          include: { cancelledBy: { select: { name: true } } },
        },
      },
    }),
    prisma.branch.findMany({ where: { status: BranchStatus.ACTIVE }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!user) notFound();

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
              <CardDescription>소속 지점은 아래 &lsquo;지점 이동&rsquo;으로만 변경할 수 있습니다.</CardDescription>
            </CardHeader>
            <CardContent>
              <EmployeeEditForm
                user={{
                  id: user.id,
                  name: user.name,
                  email: user.email,
                  phone: user.phone,
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
                          <span className="text-xs text-muted-foreground">{a.createdBy.name}</span>
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
                <div className="text-xs font-medium text-muted-foreground">소속 지점 — {user.branch?.name ?? "없음"}</div>
                <BranchChangeDialog userId={user.id} currentBranchId={user.branchId} branches={branches} />
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">비밀번호</div>
                <ResetPasswordButton userId={user.id} userName={user.name} />
                {user.mustChangePassword && (
                  <p className="text-xs text-amber-700">아직 초기 비밀번호를 변경하지 않았습니다.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-1.5">
                <History className="size-4" />
                지점 이동 이력
              </CardTitle>
            </CardHeader>
            <CardContent>
              {user.branchHistories.length === 0 ? (
                <p className="text-sm text-muted-foreground">이력이 없습니다.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {user.branchHistories.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatKstDateTime(h.changedAt)}</span>
                      <span>
                        {h.fromBranch?.name ?? "—"} → <span className="font-medium">{h.toBranch.name}</span>
                      </span>
                      {h.reason && <span className="text-xs text-muted-foreground">{h.reason}</span>}
                      <span className="text-xs text-muted-foreground">by {h.changedBy.name}</span>
                    </li>
                  ))}
                </ul>
              )}
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
