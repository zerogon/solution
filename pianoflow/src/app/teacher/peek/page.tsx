import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DatePickerPanel } from "@/components/calendar/DatePickerPanel";
import {
  availabilityMap,
  formatKstDate,
  generateSlots,
  parseKstDate,
} from "@/lib/slots";
import {
  ReservationStatus,
  Role,
  UserStatus,
} from "@/generated/prisma/enums";

interface PageProps {
  searchParams: Promise<{ date?: string; teacher?: string }>;
}

function formatKstHM(d: Date) {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${String(kst.getUTCHours()).padStart(2, "0")}:00`;
}

export default async function TeacherPeek({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const dateStr = sp.date ?? formatKstDate(new Date());
  const baseDate = parseKstDate(dateStr);

  const teachers = await prisma.user.findMany({
    where: { role: Role.TEACHER, status: UserStatus.ACTIVE },
    include: { availability: true },
    orderBy: { name: "asc" },
  });

  const otherTeachers = teachers.filter((t) => t.id !== session.user.id);
  const selected =
    otherTeachers.find((t) => t.id === sp.teacher) ?? otherTeachers[0] ?? null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>다른 선생님 일정 (읽기 전용)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {otherTeachers.map((t) => {
              const active = t.id === selected?.id;
              return (
                <Link
                  key={t.id}
                  href={{
                    pathname: "/teacher/peek",
                    query: { date: dateStr, teacher: t.id },
                  }}
                  className="contents"
                >
                  <Badge variant={active ? "default" : "outline"} className="cursor-pointer">
                    {t.name}
                  </Badge>
                </Link>
              );
            })}
          </div>
          <div className="flex justify-center">
            <DatePickerPanel selectedDateStr={dateStr} />
          </div>
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader>
            <CardTitle>{selected.name} 선생님 · {dateStr}</CardTitle>
          </CardHeader>
          <CardContent>
            <PeekSlots
              teacherId={selected.id}
              dateStr={dateStr}
              availability={selected.availability.map((a) => ({
                weekday: a.weekday,
                hours: a.hours,
              }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

async function PeekSlots({
  teacherId,
  dateStr,
  availability,
}: {
  teacherId: string;
  dateStr: string;
  availability: {
    weekday: import("@/generated/prisma/enums").Weekday;
    hours: number[];
  }[];
}) {
  const baseDate = parseKstDate(dateStr);
  const dayEnd = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);

  const booked = await prisma.reservation.findMany({
    where: {
      teacherId,
      status: ReservationStatus.ACTIVE,
      slotDatetime: { gte: baseDate, lt: dayEnd },
    },
    include: { student: true },
  });

  const bookedMap = new Map(
    booked.map((b) => [b.slotDatetime.toISOString(), b.student.name]),
  );

  const slots = generateSlots({
    dateStr,
    availabilityByWeekday: availabilityMap(availability),
    bookedSlotIsos: booked.map((b) => b.slotDatetime.toISOString()),
    myActiveSlotIsos: [],
  });

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
      {slots.map((slot) => {
        const isBooked = slot.state === "booked";
        const isUnavailable = slot.state === "unavailable";
        return (
          <div
            key={slot.iso}
            className={
              "rounded-lg border px-3 py-3 text-sm " +
              (isBooked
                ? "bg-zinc-200 text-zinc-700"
                : isUnavailable
                  ? "bg-zinc-100 text-zinc-400"
                  : "bg-emerald-50 text-emerald-900")
            }
          >
            <div className="text-base font-semibold">
              {String(slot.hour).padStart(2, "0")}:00
            </div>
            <div className="mt-0.5 text-[11px]">
              {isBooked ? bookedMap.get(slot.iso) : isUnavailable ? "불가" : "공석"}
            </div>
          </div>
        );
      })}
    </div>
  );
}
