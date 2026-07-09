import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Role } from "@/generated/prisma/enums";
import { bookingHorizon, formatKstDate, parseKstDate } from "@/lib/slots";
import { AvailabilityForm } from "./_AvailabilityForm";
import { ScheduleExceptionSection } from "./_ScheduleExceptionSection";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AvailabilityPage({ params }: PageProps) {
  const { id } = await params;
  const todayStart = parseKstDate(formatKstDate(new Date()));
  const { minDateStr, maxDateStr } = bookingHorizon(new Date());

  const [teacher, exceptions] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      include: { availability: true },
    }),
    prisma.teacherScheduleException.findMany({
      where: { teacherId: id, date: { gte: todayStart } },
      orderBy: { date: "asc" },
    }),
  ]);
  if (!teacher || teacher.role !== Role.TEACHER) notFound();

  const weekly = teacher.availability.map((a) => ({
    weekday: a.weekday,
    hours: a.hours,
  }));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>{teacher.name} 선생님 가용 요일</CardTitle>
        </CardHeader>
        <CardContent>
          <AvailabilityForm teacherId={teacher.id} initial={weekly} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>날짜별 예외 (일회성 스케줄 변경)</CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleExceptionSection
            teacherId={teacher.id}
            weekly={weekly}
            exceptions={exceptions.map((e) => ({
              date: formatKstDate(e.date),
              hours: e.hours,
            }))}
            minDate={minDateStr}
            maxDate={maxDateStr}
          />
        </CardContent>
      </Card>
    </div>
  );
}
