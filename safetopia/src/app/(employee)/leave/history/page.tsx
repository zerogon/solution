import Link from "next/link";

import { requireActiveUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { cn, parseDate, todayKstIso } from "@/lib/utils";
import { LEAVE_STATUS_LABEL } from "@/lib/labels";
import { PageHeader } from "@/components/page-header";
import { LeaveRequestList } from "@/components/leave/LeaveRequestList";
import { CancelRequestButton } from "@/components/leave/CancelRequestButton";
import { LeaveStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

export default async function LeaveHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; status?: string }>;
}) {
  const { user } = await requireActiveUser();
  const sp = await searchParams;
  const thisYear = Number(todayKstIso().slice(0, 4));
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : thisYear;
  const status = (Object.values(LeaveStatus) as string[]).includes(sp.status ?? "") ? (sp.status as LeaveStatus) : undefined;

  const [rows, years] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        userId: user.id,
        status,
        startDate: { gte: parseDate(`${year}-01-01`), lte: parseDate(`${year}-12-31`) },
      },
      orderBy: { startDate: "desc" },
      include: { approvedBy: { select: { name: true } } },
    }),
    prisma.leaveBalance.findMany({ where: { userId: user.id }, select: { year: true }, orderBy: { year: "desc" } }),
  ]);
  const yearOptions = Array.from(new Set([thisYear, ...years.map((y) => y.year)])).sort((a, b) => b - a);

  const href = (y: number, s?: LeaveStatus) => `/leave/history?year=${y}${s ? `&status=${s}` : ""}`;
  const chip = (active: boolean) =>
    cn(
      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
      active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
    );

  return (
    <div className="space-y-6">
      <PageHeader title="연차 사용 내역" description="신청·승인·반려·취소 이력을 모두 볼 수 있습니다." />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5">
          {yearOptions.map((y) => (
            <Link key={y} href={href(y, status)} className={chip(y === year)}>
              {y}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Link href={href(year)} className={chip(!status)}>
            전체
          </Link>
          {Object.values(LeaveStatus).map((s) => (
            <Link key={s} href={href(year, s)} className={chip(s === status)}>
              {LEAVE_STATUS_LABEL[s]}
            </Link>
          ))}
        </div>
      </div>

      <LeaveRequestList
        rows={rows}
        renderAction={(r) => (r.status === LeaveStatus.PENDING ? <CancelRequestButton id={r.id} /> : null)}
      />
    </div>
  );
}
