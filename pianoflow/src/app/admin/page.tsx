import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { formatKstDate, parseKstDate } from "@/lib/slots";
import {
  ReservationStatus,
  Role,
  UserStatus,
} from "@/generated/prisma/enums";

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

const MONTH_RE = /^\d{4}-\d{2}$/;

/** "YYYY-MM" → 해당 월의 다음 달 "YYYY-MM" (12월은 익년 1월) */
function addMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = (y * 12 + (m - 1)) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

export default async function AdminHome({ searchParams }: PageProps) {
  const sp = await searchParams;
  const currentMonth = formatKstDate(new Date()).slice(0, 7);
  const month = sp.month && MONTH_RE.test(sp.month) ? sp.month : currentMonth;

  const monthStart = parseKstDate(`${month}-01`);
  const monthEnd = parseKstDate(`${addMonth(month, 1)}-01`);

  const todayStr = formatKstDate(new Date());
  const todayStart = parseKstDate(todayStr);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const [activeMembers, todayReservations, lowCredit, grouped, teachers] =
    await Promise.all([
      prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      prisma.reservation.count({
        where: {
          status: ReservationStatus.ACTIVE,
          slotDatetime: { gte: todayStart, lt: todayEnd },
        },
      }),
      prisma.user.count({
        where: {
          role: Role.STUDENT,
          status: UserStatus.ACTIVE,
          remainingLessons: { lt: 2 },
        },
      }),
      prisma.reservation.groupBy({
        by: ["teacherId"],
        where: {
          status: ReservationStatus.ACTIVE,
          slotDatetime: { gte: monthStart, lt: monthEnd },
        },
        _count: { _all: true },
      }),
      prisma.user.findMany({
        where: { role: Role.TEACHER },
        orderBy: { name: "asc" },
      }),
    ]);

  const stats = [
    { label: "활성 회원", value: activeMembers, suffix: "명" },
    { label: "오늘 예약", value: todayReservations, suffix: "건" },
    { label: "크레딧 부족 학생", value: lowCredit, suffix: "명" },
  ];

  const countByTeacher = new Map(
    grouped.map((g) => [g.teacherId, g._count._all]),
  );
  const rows = teachers.map((t) => ({
    name: t.name,
    count: countByTeacher.get(t.id) ?? 0,
  }));
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));

  const [yy, mm] = month.split("-");
  const monthLabel = `${yy}년 ${Number(mm)}월`;
  const isCurrent = month === currentMonth;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">
                {s.value}
                <span className="ml-1 text-base font-normal text-muted-foreground">
                  {s.suffix}
                </span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle>월별 선생님별 레슨</CardTitle>
            <span className="text-sm text-muted-foreground">총 {total}건</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={{ pathname: "/admin", query: { month: addMonth(month, -1) } }}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              ‹ 이전 달
            </Link>
            <span className="min-w-24 text-center text-sm font-medium">
              {monthLabel}
            </span>
            <Link
              href={{ pathname: "/admin", query: { month: addMonth(month, 1) } }}
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              다음 달 ›
            </Link>
            <form method="get" className="flex items-center gap-2">
              <input
                type="month"
                name="month"
                defaultValue={month}
                className="rounded-md border px-3 py-1.5 text-sm"
              />
              <button type="submit" className={buttonVariants({ size: "sm" })}>
                적용
              </button>
            </form>
            {!isCurrent && (
              <Link
                href="/admin"
                className={buttonVariants({ size: "sm", variant: "ghost" })}
              >
                이번 달
              </Link>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-xs text-muted-foreground">
            {monthLabel} ACTIVE 예약 기준 (취소 제외)
          </p>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">선생님이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => (
                <div key={r.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{r.name}</span>
                    <span className="text-muted-foreground">{r.count}건</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${(r.count / max) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
