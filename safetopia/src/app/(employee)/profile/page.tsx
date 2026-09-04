import Link from "next/link";
import { History, KeyRound, LogOut } from "lucide-react";

import { logoutAction } from "@/actions/auth";
import { requireActiveUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getBalanceSummary } from "@/lib/queries";
import { EMPLOYEE_STATUS_LABEL, ROLE_LABEL, WEEKDAY_LABEL } from "@/lib/labels";
import { formatKoDate, toIsoDate, todayKstIso } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Role } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { user: me } = await requireActiveUser();
  const year = Number(todayKstIso().slice(0, 4));

  const [user, summary] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: me.id },
      include: { branch: { select: { name: true, address: true, closedWeekdays: true } } },
    }),
    getBalanceSummary(me.id, year),
  ]);

  const rows: [string, React.ReactNode][] = [
    ["아이디", <span key="l" className="font-mono">{user.loginId}</span>],
    ["권한", ROLE_LABEL[user.role]],
    ["재직 상태", EMPLOYEE_STATUS_LABEL[user.status]],
    ["소속 지점", user.branch ? user.branch.name : "없음"],
    [
      "지점 휴무",
      user.branch
        ? user.branch.closedWeekdays.length
          ? `매주 ${user.branch.closedWeekdays.map((d) => WEEKDAY_LABEL[d]).join("·")}요일`
          : "없음"
        : "—",
    ],
    ["입사일", user.hireDate ? <span key="h" className="font-mono tabular-nums">{formatKoDate(toIsoDate(user.hireDate))}</span> : "—"],
    ["연락처", user.phone ?? "—"],
    ["이메일", user.email ?? "—"],
  ];

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <PageHeader title="마이페이지" />

      <Card>
        <CardContent className="flex items-center gap-4 py-4">
          <Avatar size="lg">
            <AvatarFallback className="bg-primary text-primary-foreground text-lg">{user.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-heading text-lg font-semibold">{user.name}</span>
              {user.role === Role.ADMIN && <Badge variant="outline">관리자</Badge>}
            </div>
            <div className="text-sm text-muted-foreground">{user.branch?.name ?? "소속 없음"}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{year}년 연차</CardTitle>
        </CardHeader>
        <CardContent>
          {summary ? (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["총 보유", summary.total],
                ["사용", summary.used],
                ["승인 대기", summary.pending],
                ["신청 가능", summary.available],
              ].map(([label, v]) => (
                <div key={label as string} className="rounded-md bg-muted/50 px-3 py-2">
                  <dt className="text-[11px] text-muted-foreground">{label}</dt>
                  <dd className="font-mono text-lg font-semibold tabular-nums">{v as number}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">아직 부여된 연차가 없습니다.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex items-center justify-between gap-3 py-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-right">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">정보 변경은 관리자에게 요청하세요.</p>
        </CardContent>
      </Card>

      <div className="grid gap-2 sm:grid-cols-3">
        <Button variant="outline" render={<Link href="/leave/history" />} nativeButton={false}>
          <History data-icon="inline-start" />
          사용 내역
        </Button>
        <Button variant="outline" render={<Link href="/account/password" />} nativeButton={false}>
          <KeyRound data-icon="inline-start" />
          비밀번호 변경
        </Button>
        <form action={logoutAction} className="contents">
          <Button type="submit" variant="ghost" className="text-muted-foreground">
            <LogOut data-icon="inline-start" />
            로그아웃
          </Button>
        </form>
      </div>
    </div>
  );
}
