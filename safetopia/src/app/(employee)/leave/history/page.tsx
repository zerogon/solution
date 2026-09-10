import Link from "next/link";

import { requireActiveUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { cn, formatKoDate, parseDate, toIsoDate, todayKstIso } from "@/lib/utils";
import { accrualOn, periodByIndex } from "@/lib/leave-accrual";
import { LEAVE_STATUS_LABEL } from "@/lib/labels";
import { PageHeader } from "@/components/page-header";
import { LeaveRequestList } from "@/components/leave/LeaveRequestList";
import { CancelRequestButton } from "@/components/leave/CancelRequestButton";
import { LeaveStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export default async function LeaveHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; status?: string }>;
}) {
  const { user } = await requireActiveUser();
  const sp = await searchParams;
  const today = todayKstIso();
  const status = (Object.values(LeaveStatus) as string[]).includes(sp.status ?? "") ? (sp.status as LeaveStatus) : undefined;

  // 이력도 연차 회차 단위로 본다 — 캘린더 연도로 자르면 회차 중간이 잘려 잔여와 대응되지 않는다.
  const hireIso = user.hireDate ? toIsoDate(user.hireDate) : null;
  const currentIndex = hireIso ? accrualOn(hireIso, today).period.index : 0;
  const asked = Number(sp.p);
  const index =
    hireIso && Number.isInteger(asked) && asked >= 1 && asked <= currentIndex ? asked : currentIndex;
  const period = hireIso ? periodByIndex(hireIso, index) : null;
  // 최근 6회차까지만 칩으로 보여준다. 그보다 오래된 이력은 흔치 않다.
  const periodOptions = Array.from({ length: Math.min(currentIndex, 6) }, (_, i) => currentIndex - i);

  const rows = await prisma.leaveRequest.findMany({
    where: {
      userId: user.id,
      status,
      ...(period
        ? { startDate: { gte: parseDate(period.startIso), lte: parseDate(period.endIso) } }
        : {}),
    },
    orderBy: { startDate: "desc" },
    include: { cancelledBy: { select: { name: true } } },
  });

  const href = (p: number, s?: LeaveStatus) => `/leave/history?p=${p}${s ? `&status=${s}` : ""}`;
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
      active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="연차 사용 내역"
        description={
          period
            ? `${formatKoDate(period.startIso)} ~ ${formatKoDate(period.endIso)} · 신청·취소 이력을 모두 볼 수 있습니다.`
            : "신청·취소 이력을 모두 볼 수 있습니다."
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {periodOptions.map((p) => (
            <Link key={p} href={href(p, status)} className={chip(p === index)}>
              {p}년차
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Link href={href(index)} className={chip(!status)}>
            전체
          </Link>
          {Object.values(LeaveStatus).map((s) => (
            <Link key={s} href={href(index, s)} className={chip(s === status)}>
              {LEAVE_STATUS_LABEL[s]}
            </Link>
          ))}
        </div>
      </div>

      <LeaveRequestList
        rows={rows}
        renderAction={(r) =>
          r.status === LeaveStatus.CONFIRMED && toIsoDate(r.startDate) >= today ? <CancelRequestButton id={r.id} /> : null
        }
      />
    </div>
  );
}
