import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { AgendaRail, type AgendaGroup, type AgendaTone } from "@/components/schedule/AgendaRail";
import { History, X, Check, Lock } from "lucide-react";
import { ReservationStatus } from "@/generated/prisma/enums";
import { canStudentCancel, formatKstDate, parseKstDate, kstHourOf } from "@/lib/slots";
import { CancelButton } from "../_CancelButton";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function dateTimeLabel(d: Date) {
  const dateStr = formatKstDate(d);
  const dow = DOW[new Date(parseKstDate(dateStr).getTime() + 9 * 3600000).getUTCDay()];
  return `${dateStr.slice(5).replace("-", ".")} (${dow}) ${String(kstHourOf(d)).padStart(2, "0")}:00`;
}

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const all = await prisma.reservation.findMany({
    where: { studentId: session.user.id },
    include: { teacher: true },
    orderBy: { slotDatetime: "desc" },
    take: 50,
  });
  const now = new Date();

  // 월별 그룹
  const byMonth = new Map<string, typeof all>();
  for (const r of all) {
    const key = formatKstDate(r.slotDatetime).slice(0, 7).replace("-", ".");
    const arr = byMonth.get(key) ?? [];
    arr.push(r);
    byMonth.set(key, arr);
  }

  const groups: AgendaGroup[] = Array.from(byMonth.entries()).map(
    ([month, items]) => ({
      label: month,
      items: items.map((r) => {
        const cancelled = r.status === ReservationStatus.CANCELLED;
        const past = r.slotDatetime < now;
        const tone: AgendaTone = cancelled || past ? "muted" : "default";
        let trailing;
        if (cancelled)
          trailing = (
            <Badge variant="destructive">
              <X aria-hidden className="size-3" />
              취소됨
            </Badge>
          );
        else if (past)
          trailing = (
            <Badge variant="secondary">
              <Check aria-hidden className="size-3" />
              완료
            </Badge>
          );
        else if (canStudentCancel(r.slotDatetime, now))
          trailing = <CancelButton reservationId={r.id} />;
        else
          trailing = (
            <Badge variant="outline">
              <Lock aria-hidden className="size-3" />
              마감
            </Badge>
          );
        return {
          id: r.id,
          time: dateTimeLabel(r.slotDatetime),
          title: `${r.teacher.name} 선생님`,
          tone,
          trailing,
        };
      }),
    }),
  );

  return (
    <div className="space-y-5">
      <PageHeader title="예약 내역" description="최근 50건의 레슨 기록입니다." />
      {all.length === 0 ? (
        <EmptyState icon={History} title="예약 내역이 없습니다" />
      ) : (
        <AgendaRail groups={groups} />
      )}
    </div>
  );
}
