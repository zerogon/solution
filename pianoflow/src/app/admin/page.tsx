import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { StatCard } from "@/components/stat-card";
import { DayTimeline, type TimelineItem } from "@/components/schedule/DayTimeline";
import { Users, CalendarCheck, TrendingDown, ChevronLeft, ChevronRight, Shield } from "lucide-react";
import { formatKstDate, parseKstDate, kstHourOf } from "@/lib/slots";
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

  const [
    activeMembers,
    todayReservations,
    lowLessonStudents,
    grouped,
    teachers,
    todayList,
  ] = await Promise.all([
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
    prisma.reservation.findMany({
      where: {
        status: ReservationStatus.ACTIVE,
        slotDatetime: { gte: todayStart, lt: todayEnd },
      },
      include: { teacher: true, student: true },
      orderBy: { slotDatetime: "asc" },
    }),
  ]);

  const todayTimeline: TimelineItem[] = todayList.map((r) => ({
    hour: kstHourOf(r.slotDatetime),
    title: `${r.student.name} 학생`,
    subtitle: `${r.teacher.name} 선생님${r.forcedByAdmin ? " · 강제" : ""}`,
    icon: r.forcedByAdmin ? (
      <Shield aria-hidden className="size-3.5 shrink-0 text-primary/70" />
    ) : undefined,
  }));

  const stats = [
    { label: "활성 회원", value: activeMembers, suffix: "명", icon: Users },
    {
      label: "오늘 예약",
      value: todayReservations,
      suffix: "건",
      icon: CalendarCheck,
    },
    {
      label: "레슨 부족 학생",
      value: lowLessonStudents,
      suffix: "명",
      icon: TrendingDown,
    },
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
      <PageHeader title="대시보드" description="학원 운영 현황을 한눈에 확인하세요." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            suffix={s.suffix}
            icon={s.icon}
          />
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="px-0.5 text-sm font-medium text-muted-foreground">
          오늘 예약 <span className="font-mono text-xs text-primary">{todayStr.slice(5).replace("-", ".")}</span>
        </h2>
        <DayTimeline items={todayTimeline} emptyHint="오늘 예약이 없습니다." />
      </section>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle>월별 선생님별 레슨</CardTitle>
            <span className="text-sm text-muted-foreground">총 {total}건</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={{ pathname: "/admin", query: { month: addMonth(month, -1) } }}
              aria-label="이전 달"
              className={buttonVariants({ size: "icon-sm", variant: "outline" })}
            >
              <ChevronLeft className="size-4" />
            </Link>
            <span className="min-w-24 text-center text-sm font-medium">
              {monthLabel}
            </span>
            <Link
              href={{ pathname: "/admin", query: { month: addMonth(month, 1) } }}
              aria-label="다음 달"
              className={buttonVariants({ size: "icon-sm", variant: "outline" })}
            >
              <ChevronRight className="size-4" />
            </Link>
            <form method="get" className="flex items-center gap-2">
              <input
                type="month"
                name="month"
                defaultValue={month}
                className="h-7 rounded-md border bg-transparent px-2.5 text-sm transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
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
            {monthLabel} 활성화된 예약 기준 (취소 제외)
          </p>
          {rows.length === 0 ? (
            <EmptyState icon={Users} title="선생님이 없습니다" />
          ) : (
            <div className="space-y-3.5">
              {rows.map((r) => (
                <div key={r.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{r.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {r.count}건
                    </span>
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
