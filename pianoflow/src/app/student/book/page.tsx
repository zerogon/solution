import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { WeekStrip } from "@/components/schedule/WeekStrip";
import { SlotGrid } from "@/components/calendar/SlotGrid";
import {
  DaySchedule,
  type DayScheduleItem,
} from "@/components/calendar/DaySchedule";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { CalendarOff } from "lucide-react";
import Link from "next/link";
import {
  availabilityMap,
  formatKstDate,
  generateSlots,
  parseKstDate,
  weekdayOf,
} from "@/lib/slots";
import {
  ReservationStatus,
  Role,
  UserStatus,
} from "@/generated/prisma/enums";
import { specialtyLabels } from "@/lib/specialty";

interface PageProps {
  searchParams: Promise<{ date?: string; teacher?: string }>;
}

export default async function BookPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  // 당일 예약 불가 → 기본 선택일은 내일(KST)
  const todayStart = parseKstDate(formatKstDate(new Date()));
  const tomorrowStr = formatKstDate(
    new Date(todayStart.getTime() + 24 * 60 * 60 * 1000),
  );
  const dateStr = sp.date ?? tomorrowStr;
  const baseDate = parseKstDate(dateStr);
  const weekday = weekdayOf(baseDate);

  const teachers = await prisma.user.findMany({
    where: {
      role: Role.TEACHER,
      status: UserStatus.ACTIVE,
    },
    include: { availability: true },
    orderBy: { name: "asc" },
  });

  // 선택한 날짜의 요일에 가능한 선생님만 활성화
  const available = teachers.map((t) => ({
    ...t,
    isAvailableToday: t.availability.some((a) => a.weekday === weekday),
  }));

  const selectedTeacher =
    available.find((t) => t.id === sp.teacher && t.isAvailableToday) ??
    available.find((t) => t.isAvailableToday) ??
    null;

  const dayStart = new Date(baseDate);
  const dayEnd = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);

  const daySchedule = await prisma.reservation.findMany({
    where: {
      status: ReservationStatus.ACTIVE,
      slotDatetime: { gte: dayStart, lt: dayEnd },
    },
    select: {
      id: true,
      slotDatetime: true,
      studentId: true,
      isPrivate: true,
      teacher: { select: { name: true } },
      student: { select: { name: true } },
    },
    orderBy: { slotDatetime: "asc" },
  });

  const dayScheduleItems: DayScheduleItem[] = daySchedule.map((r) => ({
    id: r.id,
    slotDatetime: r.slotDatetime,
    teacherName: r.teacher.name,
    studentName: r.student.name,
    isMine: r.studentId === session.user.id,
    isPrivate: r.isPrivate,
  }));

  let slotsArea: React.ReactNode = (
    <EmptyState
      icon={CalendarOff}
      title="예약 가능한 선생님이 없습니다"
      description="다른 날짜를 선택하면 가능한 선생님이 나타납니다."
    />
  );

  let reservationByIso: Record<string, string> = {};

  if (selectedTeacher) {
    const [booked, mine] = await Promise.all([
      prisma.reservation.findMany({
        where: {
          teacherId: selectedTeacher.id,
          status: ReservationStatus.ACTIVE,
          slotDatetime: { gte: dayStart, lt: dayEnd },
        },
        select: { slotDatetime: true, studentId: true, id: true },
      }),
      prisma.reservation.findMany({
        where: {
          studentId: session.user.id,
          status: ReservationStatus.ACTIVE,
          slotDatetime: { gte: dayStart, lt: dayEnd },
          teacherId: selectedTeacher.id,
        },
        select: { slotDatetime: true, id: true },
      }),
    ]);

    const myIsoSet = new Set(mine.map((r) => r.slotDatetime.toISOString()));
    reservationByIso = Object.fromEntries(
      mine.map((r) => [r.slotDatetime.toISOString(), r.id]),
    );

    const slots = generateSlots({
      dateStr,
      availabilityByWeekday: availabilityMap(selectedTeacher.availability),
      bookedSlotIsos: booked
        .filter((b) => !myIsoSet.has(b.slotDatetime.toISOString()))
        .map((b) => b.slotDatetime.toISOString()),
      myActiveSlotIsos: mine.map((r) => r.slotDatetime.toISOString()),
    });

    slotsArea = (
      <SlotGrid
        teacherId={selectedTeacher.id}
        teacherName={selectedTeacher.name}
        dateStr={dateStr}
        slots={slots}
        reservationByIso={reservationByIso}
      />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="레슨 예약"
        description="날짜와 선생님, 시간을 차례로 선택하세요."
      />

      <Card>
        <CardHeader>
          <StepTitle n={1}>날짜 선택</StepTitle>
        </CardHeader>
        <CardContent>
          <WeekStrip selectedDateStr={dateStr} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <StepTitle n={2}>선생님 선택</StepTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {available.map((t) => {
            const active = t.id === selectedTeacher?.id;
            const specialty = specialtyLabels(t.specialties);
            return (
              <Link
                key={t.id}
                href={{
                  pathname: "/student/book",
                  query: { date: dateStr, teacher: t.id },
                }}
                className="flex flex-col items-center gap-0.5"
              >
                <Badge
                  variant={active ? "default" : "outline"}
                  className={
                    !t.isAvailableToday
                      ? "opacity-40 line-through"
                      : "cursor-pointer text-sm py-1.5 px-3"
                  }
                >
                  {t.name}
                </Badge>
                {specialty && (
                  <span
                    className={
                      "text-[11px] " +
                      (t.isAvailableToday
                        ? "text-muted-foreground"
                        : "text-muted-foreground/40")
                    }
                  >
                    {specialty}
                  </span>
                )}
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <StepTitle n={3}>시간 선택</StepTitle>
        </CardHeader>
        <CardContent>{slotsArea}</CardContent>
      </Card>

      <Card>
        <CardHeader>
          <StepTitle n={4}>같은 날 다른 학생 일정</StepTitle>
        </CardHeader>
        <CardContent>
          <DaySchedule dateStr={dateStr} items={dayScheduleItems} />
        </CardContent>
      </Card>
    </div>
  );
}

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <CardTitle className="flex items-center gap-2">
      <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {n}
      </span>
      {children}
    </CardTitle>
  );
}
