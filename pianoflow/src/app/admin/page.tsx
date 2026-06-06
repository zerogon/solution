import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DayTimeline, type TimelineItem } from "@/components/schedule/DayTimeline";
import { Users, CalendarCheck, TrendingDown, Shield } from "lucide-react";
import { formatKstDate, parseKstDate, kstHourOf } from "@/lib/slots";
import { addMonth } from "@/lib/month";
import { MonthlyTeacherLessons } from "./_MonthlyTeacherLessons";
import {
  ReservationStatus,
  Role,
  UserStatus,
} from "@/generated/prisma/enums";

export default async function AdminHome() {
  const currentMonth = formatKstDate(new Date()).slice(0, 7);
  const month = currentMonth;

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

      <MonthlyTeacherLessons
        initial={{ month, rows, total, max }}
        currentMonth={currentMonth}
      />
    </div>
  );
}
