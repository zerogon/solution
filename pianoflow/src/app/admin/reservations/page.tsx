import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ReservationStatus,
  Role,
  UserStatus,
} from "@/generated/prisma/enums";
import {
  availabilityMap,
  formatKstDate,
  generateSlots,
  parseKstDate,
  kstHourOf,
  kstMinutesOfDay,
} from "@/lib/slots";
import { ensureRecurringMaterialized } from "@/lib/recurring";
import { reservedFutureCounts } from "@/lib/credits";
import { SlotGrid } from "@/components/calendar/SlotGrid";
import { PageHeader } from "@/components/page-header";
import { WeekStrip } from "@/components/schedule/WeekStrip";
import { DayTimeline, type TimelineItem } from "@/components/schedule/DayTimeline";
import { Repeat, Shield } from "lucide-react";
import { AdminCancelButton } from "./_AdminCancelButton";
import { AdminForceTeacherSelect } from "./_AdminForceTeacherSelect";

interface PageProps {
  searchParams: Promise<{ date?: string; teacher?: string; student?: string }>;
}

export default async function AdminReservations({ searchParams }: PageProps) {
  const sp = await searchParams;
  const todayStr = formatKstDate(new Date());
  const dateStr = sp.date ?? todayStr;
  const isToday = dateStr === todayStr;
  const nowMin = kstMinutesOfDay(new Date());
  const nowHour = Math.floor(nowMin / 60);
  const baseDate = parseKstDate(dateStr);
  const dayEnd = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);

  await ensureRecurringMaterialized();

  const [teachers, students, reservations] = await Promise.all([
    prisma.user.findMany({
      where: { role: Role.TEACHER, status: UserStatus.ACTIVE },
      include: { availability: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: { role: Role.STUDENT, status: UserStatus.ACTIVE },
      orderBy: { name: "asc" },
    }),
    prisma.reservation.findMany({
      where: {
        status: ReservationStatus.ACTIVE,
        slotDatetime: { gte: baseDate, lt: dayEnd },
      },
      include: { teacher: true, student: true },
      orderBy: [{ slotDatetime: "asc" }, { teacherId: "asc" }],
    }),
  ]);

  // 강제 예약 셀렉트(활성 학생) + 예약 현황 타임라인(비활성 학생 예약 포함) 둘 다 커버
  const reservedMap = await reservedFutureCounts([
    ...new Set([
      ...students.map((s) => s.id),
      ...reservations.map((r) => r.studentId),
    ]),
  ]);

  const selectedTeacher =
    teachers.find((t) => t.id === sp.teacher) ?? teachers[0] ?? null;
  const selectedStudentId = sp.student ?? students[0]?.id;

  const timeline: TimelineItem[] = reservations.map((r) => {
    const reserved = reservedMap.get(r.studentId) ?? 0;
    const hour = kstHourOf(r.slotDatetime);
    // 지난/진행중은 시간 톤 우선, 그 외에는 기존 의미 톤(강제·고정=accent) 유지
    const tone =
      dateStr < todayStr || (isToday && hour < nowHour)
        ? "muted"
        : isToday && hour === nowHour
          ? "now"
          : r.forcedByAdmin || r.recurringId
            ? "accent"
            : "default";
    return {
      hour,
      title: `${r.student.name} 학생 · 남은 ${r.student.remainingLessons + reserved}회`,
      subtitle: `${r.teacher.name} 선생님 · ${
        r.forcedByAdmin ? "강제" : r.recurringId ? "고정" : "일반"
      }`,
      tone,
      icon: r.forcedByAdmin ? (
        <Shield aria-hidden className="size-3.5 shrink-0 text-primary/70" />
      ) : r.recurringId ? (
        <Repeat aria-hidden className="size-3.5 shrink-0 text-primary/70" />
      ) : undefined,
      trailing: <AdminCancelButton reservationId={r.id} />,
    };
  });

  let forceArea: React.ReactNode = null;
  if (selectedTeacher && selectedStudentId) {
    const [booked, exception] = await Promise.all([
      prisma.reservation.findMany({
        where: {
          teacherId: selectedTeacher.id,
          status: ReservationStatus.ACTIVE,
          slotDatetime: { gte: baseDate, lt: dayEnd },
        },
      }),
      prisma.teacherScheduleException.findUnique({
        where: {
          teacherId_date: { teacherId: selectedTeacher.id, date: baseDate },
        },
      }),
    ]);
    const slots = generateSlots({
      dateStr,
      availabilityByWeekday: availabilityMap(selectedTeacher.availability),
      overrideHours: exception ? exception.hours : undefined,
      bookedSlotIsos: booked.map((b) => b.slotDatetime.toISOString()),
      myActiveSlotIsos: [],
    });
    forceArea = (
      <SlotGrid
        teacherId={selectedTeacher.id}
        teacherName={selectedTeacher.name}
        dateStr={dateStr}
        slots={slots}
        asAdmin
        studentId={selectedStudentId}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="예약 관리"
        description="날짜별 예약 현황을 확인하고 강제 예약을 생성합니다."
      />

      <WeekStrip selectedDateStr={dateStr} />

      <section
        key={dateStr}
        data-week-dim
        className="space-y-2 animate-in fade-in duration-200"
      >
        <h2 className="px-0.5 text-sm font-medium text-muted-foreground">
          {dateStr.slice(5).replace("-", ".")} 예약 현황
          <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
            {reservations.length}건
          </span>
        </h2>
        <DayTimeline
          items={timeline}
          emptyHint="이 날은 예약이 없습니다."
          nowMinutes={isToday ? nowMin : undefined}
          collapseEmptyHours
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>강제 예약 생성</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">선생님</span>
            {teachers.map((t) => {
              const active = t.id === selectedTeacher?.id;
              return (
                <Link
                  key={t.id}
                  href={{
                    pathname: "/admin/reservations",
                    query: { date: dateStr, teacher: t.id, student: selectedStudentId },
                  }}
                  className="contents"
                >
                  <Badge
                    variant={active ? "default" : "outline"}
                    className="cursor-pointer"
                  >
                    {t.name}
                  </Badge>
                </Link>
              );
            })}
          </div>
          <AdminForceTeacherSelect
            students={students.map((s) => ({
              id: s.id,
              name: s.name,
              remaining: s.remainingLessons,
              reserved: reservedMap.get(s.id) ?? 0,
            }))}
            currentStudentId={selectedStudentId}
            dateStr={dateStr}
            teacherId={selectedTeacher?.id}
          />
          {forceArea}
        </CardContent>
      </Card>
    </div>
  );
}
