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
} from "@/lib/slots";
import { SlotGrid } from "@/components/calendar/SlotGrid";
import { PageHeader } from "@/components/page-header";
import { WeekStrip } from "@/components/schedule/WeekStrip";
import { DayTimeline, type TimelineItem } from "@/components/schedule/DayTimeline";
import { Shield } from "lucide-react";
import { AdminCancelButton } from "./_AdminCancelButton";
import { AdminForceTeacherSelect } from "./_AdminForceTeacherSelect";

interface PageProps {
  searchParams: Promise<{ date?: string; teacher?: string; student?: string }>;
}

export default async function AdminReservations({ searchParams }: PageProps) {
  const sp = await searchParams;
  const dateStr = sp.date ?? formatKstDate(new Date());
  const baseDate = parseKstDate(dateStr);
  const dayEnd = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);

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

  const selectedTeacher =
    teachers.find((t) => t.id === sp.teacher) ?? teachers[0] ?? null;
  const selectedStudentId = sp.student ?? students[0]?.id;

  const timeline: TimelineItem[] = reservations.map((r) => ({
    hour: kstHourOf(r.slotDatetime),
    title: `${r.student.name} 학생`,
    subtitle: `${r.teacher.name} 선생님 · ${r.forcedByAdmin ? "강제" : "일반"}`,
    tone: r.forcedByAdmin ? "accent" : "default",
    icon: r.forcedByAdmin ? (
      <Shield aria-hidden className="size-3.5 shrink-0 text-primary/70" />
    ) : undefined,
    trailing: <AdminCancelButton reservationId={r.id} />,
  }));

  let forceArea: React.ReactNode = null;
  if (selectedTeacher && selectedStudentId) {
    const booked = await prisma.reservation.findMany({
      where: {
        teacherId: selectedTeacher.id,
        status: ReservationStatus.ACTIVE,
        slotDatetime: { gte: baseDate, lt: dayEnd },
      },
    });
    const slots = generateSlots({
      dateStr,
      availabilityByWeekday: availabilityMap(selectedTeacher.availability),
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

      <section className="space-y-2">
        <h2 className="px-0.5 text-sm font-medium text-muted-foreground">
          {dateStr.slice(5).replace("-", ".")} 예약 현황
          <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
            {reservations.length}건
          </span>
        </h2>
        <DayTimeline items={timeline} emptyHint="이 날은 예약이 없습니다." />
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
            students={students.map((s) => ({ id: s.id, name: s.name, remaining: s.remainingLessons }))}
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
