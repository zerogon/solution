import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { DayTimeline, type TimelineItem } from "@/components/schedule/DayTimeline";
import { Users, CalendarCheck, TrendingDown, Shield } from "lucide-react";
import {
  formatKstDate,
  parseKstDate,
  kstHourOf,
  kstMinutesOfDay,
} from "@/lib/slots";
import { cn } from "@/lib/utils";
import { addMonth } from "@/lib/month";
import { teacherDotClass } from "@/lib/teacher-colors";
import { buildTeacherLessonTrend, trendMonths } from "@/lib/lesson-trend";
import { MonthlyTeacherLessons } from "./_MonthlyTeacherLessons";
import { TeacherLessonTrend } from "./_TeacherLessonTrend";
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

  const trendStart = parseKstDate(`${trendMonths(currentMonth)[0]}-01`);

  const [
    activeMembers,
    todayReservations,
    lowLessonStudents,
    grouped,
    teachers,
    todayList,
    trendReservations,
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
    prisma.reservation.findMany({
      where: {
        status: ReservationStatus.ACTIVE,
        slotDatetime: { gte: trendStart, lt: monthEnd },
      },
      select: { teacherId: true, slotDatetime: true },
    }),
  ]);

  const nowMin = kstMinutesOfDay(new Date());
  const nowHour = Math.floor(nowMin / 60);

  const dotByTeacher = new Map(
    teachers.map((t, i) => [t.id, teacherDotClass(i)]),
  );

  const ongoing = todayList.find((r) => kstHourOf(r.slotDatetime) === nowHour);
  const next = todayList.find((r) => kstHourOf(r.slotDatetime) > nowHour);
  const nextHour = next ? kstHourOf(next.slotDatetime) : undefined;
  const highlight = ongoing ?? next;

  const todayTimeline: TimelineItem[] = todayList.map((r) => {
    const hour = kstHourOf(r.slotDatetime);
    return {
      hour,
      title: `${r.student.name} 학생`,
      subtitle: `${r.teacher.name} 선생님${r.forcedByAdmin ? " · 강제" : ""}`,
      tone:
        hour < nowHour
          ? "muted"
          : hour === nowHour
            ? "now"
            : hour === nextHour
              ? "accent"
              : "default",
      icon: (
        <>
          <span
            aria-hidden
            className={cn(
              "size-2 shrink-0 rounded-full",
              dotByTeacher.get(r.teacherId),
            )}
          />
          {r.forcedByAdmin && (
            <Shield aria-hidden className="size-3.5 shrink-0 text-primary/70" />
          )}
        </>
      ),
    };
  });

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
  const trend = buildTeacherLessonTrend(currentMonth, teachers, trendReservations);

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <section className="space-y-2">
          <div className="flex items-baseline justify-between gap-2 px-0.5">
            <h2 className="text-sm font-medium text-muted-foreground">
              오늘 예약 <span className="font-mono text-xs text-primary">{todayStr.slice(5).replace("-", ".")}</span>
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              총{" "}
              <span className="font-mono font-medium tabular-nums text-foreground">
                {todayList.length}
              </span>
              건
              {highlight && (
                <>
                  {" · "}
                  {ongoing ? "진행 중" : "다음"}{" "}
                  <span className="font-mono font-medium tabular-nums text-primary">
                    {String(kstHourOf(highlight.slotDatetime)).padStart(2, "0")}
                    :00
                  </span>{" "}
                  {highlight.student.name} 학생
                </>
              )}
            </p>
          </div>
          <DayTimeline
            items={todayTimeline}
            emptyHint="오늘 예약이 없습니다."
            nowMinutes={nowMin}
            collapseEmptyHours
          />
        </section>

        <div className="space-y-6">
          <MonthlyTeacherLessons
            initial={{ month, rows, total, max }}
            currentMonth={currentMonth}
          />
          <TeacherLessonTrend initial={trend} currentMonth={currentMonth} />
        </div>
      </div>
    </div>
  );
}
