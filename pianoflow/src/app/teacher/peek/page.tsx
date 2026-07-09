import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { WeekStrip } from "@/components/schedule/WeekStrip";
import { DayTimeline, type TimelineItem } from "@/components/schedule/DayTimeline";
import {
  availabilityMap,
  formatKstDate,
  generateSlots,
  parseKstDate,
} from "@/lib/slots";
import { ReservationStatus, Role, UserStatus } from "@/generated/prisma/enums";
import { Users } from "lucide-react";

interface PageProps {
  searchParams: Promise<{ date?: string; teacher?: string }>;
}

export default async function TeacherPeek({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const dateStr = sp.date ?? formatKstDate(new Date());

  const teachers = await prisma.user.findMany({
    where: { role: Role.TEACHER, status: UserStatus.ACTIVE },
    include: { availability: true },
    orderBy: { name: "asc" },
  });
  const others = teachers.filter((t) => t.id !== session.user.id);
  const selected = others.find((t) => t.id === sp.teacher) ?? others[0] ?? null;

  let timeline: TimelineItem[] = [];
  if (selected) {
    const dayStart = parseKstDate(dateStr);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const [booked, exception] = await Promise.all([
      prisma.reservation.findMany({
        where: {
          teacherId: selected.id,
          status: ReservationStatus.ACTIVE,
          slotDatetime: { gte: dayStart, lt: dayEnd },
        },
        include: { student: true },
      }),
      prisma.teacherScheduleException.findUnique({
        where: { teacherId_date: { teacherId: selected.id, date: dayStart } },
      }),
    ]);
    const bookedMap = new Map(
      booked.map((b) => [b.slotDatetime.toISOString(), b.student.name]),
    );
    const slots = generateSlots({
      dateStr,
      availabilityByWeekday: availabilityMap(selected.availability),
      overrideHours: exception ? exception.hours : undefined,
      bookedSlotIsos: booked.map((b) => b.slotDatetime.toISOString()),
      myActiveSlotIsos: [],
    });
    timeline = slots.flatMap((s): TimelineItem[] => {
      if (s.state === "booked")
        return [
          {
            hour: s.hour,
            title: bookedMap.get(s.iso) ?? "예약됨",
            subtitle: "예약됨",
            tone: "default",
          },
        ];
      if (s.state === "available")
        return [{ hour: s.hour, title: "예약 가능", tone: "muted" }];
      return [];
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="다른 선생님 일정"
        description="다른 선생님의 일정을 읽기 전용으로 확인합니다."
      />

      {others.length === 0 ? (
        <EmptyState icon={Users} title="조회할 다른 선생님이 없습니다" />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {others.map((t) => {
              const active = t.id === selected?.id;
              return (
                <Link
                  key={t.id}
                  href={{ pathname: "/teacher/peek", query: { date: dateStr, teacher: t.id } }}
                  className="contents"
                >
                  <Badge
                    variant={active ? "default" : "outline"}
                    className="cursor-pointer px-3 py-1"
                  >
                    {t.name}
                  </Badge>
                </Link>
              );
            })}
          </div>

          <WeekStrip selectedDateStr={dateStr} />

          {selected && (
            <section className="space-y-2">
              <h2 className="px-0.5 text-sm font-medium text-muted-foreground">
                {selected.name} 선생님 · {dateStr.slice(5).replace("-", ".")}
              </h2>
              <DayTimeline
                items={timeline}
                emptyHint="이 날은 예약 가능 시간이 없습니다."
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
