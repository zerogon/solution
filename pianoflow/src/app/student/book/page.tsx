import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DatePickerPanel } from "@/components/calendar/DatePickerPanel";
import { SlotGrid } from "@/components/calendar/SlotGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
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

interface PageProps {
  searchParams: Promise<{ date?: string; teacher?: string }>;
}

export default async function BookPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const dateStr = sp.date ?? formatKstDate(new Date());
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

  let slotsArea: React.ReactNode = (
    <p className="text-sm text-muted-foreground">
      선택한 날짜에 예약 가능한 선생님이 없습니다.
    </p>
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
      teacherWeekdays: selectedTeacher.availability.map((a) => a.weekday),
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. 날짜 선택</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center">
          <DatePickerPanel selectedDateStr={dateStr} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. 선생님 선택</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {available.map((t) => {
            const active = t.id === selectedTeacher?.id;
            return (
              <Link
                key={t.id}
                href={{
                  pathname: "/student/book",
                  query: { date: dateStr, teacher: t.id },
                }}
                className="contents"
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
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. 시간 선택</CardTitle>
        </CardHeader>
        <CardContent>{slotsArea}</CardContent>
      </Card>
    </div>
  );
}
