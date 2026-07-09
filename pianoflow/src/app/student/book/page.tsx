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
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { CalendarOff, CircleCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  availabilityMap,
  bookingHorizon,
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
import { ACCENT_DOT, teacherAccentAt } from "@/lib/teacher-accent";

interface PageProps {
  searchParams: Promise<{ date?: string; teacher?: string }>;
}

export default async function BookPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  // 당일 예약 불가 → 기본 선택일은 내일(KST). 예약 가능 창(4주치)을 벗어난 날짜는 클램프.
  const { minDateStr, maxDateStr } = bookingHorizon(new Date());
  const requested = sp.date ?? minDateStr;
  const dateStr =
    requested < minDateStr
      ? minDateStr
      : requested > maxDateStr
        ? maxDateStr
        : requested;
  const baseDate = parseKstDate(dateStr);
  const weekday = weekdayOf(baseDate);

  const [teachers, exceptions] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: Role.TEACHER,
        status: UserStatus.ACTIVE,
      },
      include: { availability: true },
      orderBy: { name: "asc" },
    }),
    prisma.teacherScheduleException.findMany({
      where: { date: baseDate },
      select: { teacherId: true, hours: true },
    }),
  ]);
  const overrideByTeacher = new Map(
    exceptions.map((e) => [e.teacherId, e.hours]),
  );

  // 선택한 날짜에 가능한 선생님만 활성화. 날짜 예외가 있으면 요일 기본값을 덮어쓴다.
  // accent는 이름순 인덱스로 고정 배정.
  const available = teachers.map((t, i) => {
    const override = overrideByTeacher.get(t.id);
    const isAvailableToday =
      override !== undefined
        ? override.length > 0
        : t.availability.some((a) => a.weekday === weekday);
    return { ...t, isAvailableToday, accent: teacherAccentAt(i) };
  });

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
      overrideHours: overrideByTeacher.has(selectedTeacher.id)
        ? overrideByTeacher.get(selectedTeacher.id)
        : undefined,
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
        accent={selectedTeacher.accent}
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
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {available.map((t) => {
            const active = t.id === selectedTeacher?.id;
            const specialty = specialtyLabels(t.specialties);
            if (!t.isAvailableToday) {
              return (
                <div
                  key={t.id}
                  aria-disabled="true"
                  className="flex min-h-14 items-center justify-between gap-2 rounded-lg border border-dashed p-3 opacity-50 select-none"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          ACCENT_DOT[t.accent],
                        )}
                      />
                      <span className="truncate text-sm font-medium">
                        {t.name}
                      </span>
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {specialty ? `${specialty} · ` : ""}이 날짜 불가
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <Link
                key={t.id}
                href={{
                  pathname: "/student/book",
                  query: { date: dateStr, teacher: t.id },
                }}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex min-h-14 items-center justify-between gap-2 rounded-lg border p-3 transition-colors",
                  active
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-card hover:border-primary/40 hover:bg-muted/50",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        ACCENT_DOT[t.accent],
                      )}
                    />
                    <span
                      className={cn(
                        "truncate text-sm font-medium",
                        active && "text-primary",
                      )}
                    >
                      {t.name}
                    </span>
                  </div>
                  {specialty && (
                    <div className="truncate text-xs text-muted-foreground">
                      {specialty}
                    </div>
                  )}
                </div>
                {active && (
                  <CircleCheck
                    aria-hidden
                    className="size-4 shrink-0 text-primary"
                  />
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
