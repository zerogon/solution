import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
} from "@/lib/slots";
import { DatePickerPanel } from "@/components/calendar/DatePickerPanel";
import { SlotGrid } from "@/components/calendar/SlotGrid";
import { AdminCancelButton } from "./_AdminCancelButton";
import { AdminForceTeacherSelect } from "./_AdminForceTeacherSelect";

interface PageProps {
  searchParams: Promise<{ date?: string; teacher?: string; student?: string }>;
}

function formatKstHM(d: Date) {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${String(kst.getUTCHours()).padStart(2, "0")}:00`;
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
      orderBy: [{ teacherId: "asc" }, { slotDatetime: "asc" }],
    }),
  ]);

  const selectedTeacher =
    teachers.find((t) => t.id === sp.teacher) ?? teachers[0] ?? null;
  const selectedStudentId = sp.student ?? students[0]?.id;

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
      <Card>
        <CardHeader>
          <CardTitle>날짜 선택</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center">
          <DatePickerPanel selectedDateStr={dateStr} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{dateStr} 예약 현황 ({reservations.length}건)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>시간</TableHead>
                <TableHead>선생님</TableHead>
                <TableHead>학생</TableHead>
                <TableHead>유형</TableHead>
                <TableHead className="text-right">조치</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reservations.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{formatKstHM(r.slotDatetime)}</TableCell>
                  <TableCell>{r.teacher.name}</TableCell>
                  <TableCell>{r.student.name}</TableCell>
                  <TableCell>
                    {r.forcedByAdmin ? (
                      <Badge variant="outline">강제</Badge>
                    ) : (
                      <Badge variant="secondary">일반</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <AdminCancelButton reservationId={r.id} />
                  </TableCell>
                </TableRow>
              ))}
              {reservations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    예약이 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>강제 예약 생성</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className="text-sm">선생님:</span>
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
                  <Badge variant={active ? "default" : "outline"} className="cursor-pointer">
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
