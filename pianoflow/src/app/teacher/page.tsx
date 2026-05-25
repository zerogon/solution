import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReservationStatus } from "@/generated/prisma/enums";
import { formatKstDate, parseKstDate } from "@/lib/slots";

function formatKstHM(d: Date) {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${String(kst.getUTCHours()).padStart(2, "0")}:00`;
}

export default async function TeacherHome() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const todayStr = formatKstDate(new Date());
  const todayStart = parseKstDate(todayStr);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const today = await prisma.reservation.findMany({
    where: {
      teacherId: session.user.id,
      status: ReservationStatus.ACTIVE,
      slotDatetime: { gte: todayStart, lt: todayEnd },
    },
    include: { student: true },
    orderBy: { slotDatetime: "asc" },
  });

  const week = await prisma.reservation.findMany({
    where: {
      teacherId: session.user.id,
      status: ReservationStatus.ACTIVE,
      slotDatetime: { gte: todayEnd, lt: weekEnd },
    },
    include: { student: true },
    orderBy: { slotDatetime: "asc" },
  });

  // 주간 그룹화
  const grouped = new Map<string, typeof week>();
  for (const r of week) {
    const d = formatKstDate(r.slotDatetime);
    const arr = grouped.get(d) ?? [];
    arr.push(r);
    grouped.set(d, arr);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>오늘 일정 ({todayStr})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {today.length === 0 ? (
            <p className="text-sm text-muted-foreground">오늘 예약이 없습니다.</p>
          ) : (
            today.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="text-sm font-medium">
                  {formatKstHM(r.slotDatetime)}
                </div>
                <div className="text-sm">{r.student.name}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>다가오는 주간 일정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {grouped.size === 0 ? (
            <p className="text-sm text-muted-foreground">예정된 일정이 없습니다.</p>
          ) : (
            Array.from(grouped.entries()).map(([dateStr, items]) => (
              <div key={dateStr} className="space-y-1">
                <div className="text-sm font-semibold">{dateStr}</div>
                <div className="flex flex-wrap gap-2">
                  {items.map((r) => (
                    <Badge key={r.id} variant="secondary">
                      {formatKstHM(r.slotDatetime)} · {r.student.name}
                    </Badge>
                  ))}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
