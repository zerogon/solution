import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReservationStatus } from "@/generated/prisma/enums";

export default async function TeacherStudents() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const recent = await prisma.reservation.findMany({
    where: {
      teacherId: session.user.id,
      status: ReservationStatus.ACTIVE,
    },
    include: { student: true },
    orderBy: { slotDatetime: "desc" },
    take: 200,
  });

  // 학생별 그룹: 마지막 예약 시각 + 예약 횟수
  const byStudent = new Map<
    string,
    { name: string; lastSlot: Date; count: number; remaining: number }
  >();
  for (const r of recent) {
    const cur = byStudent.get(r.studentId);
    if (cur) {
      cur.count += 1;
      if (r.slotDatetime > cur.lastSlot) cur.lastSlot = r.slotDatetime;
    } else {
      byStudent.set(r.studentId, {
        name: r.student.name,
        lastSlot: r.slotDatetime,
        count: 1,
        remaining: r.student.remainingLessons,
      });
    }
  }

  const rows = Array.from(byStudent.entries()).sort((a, b) =>
    a[1].name.localeCompare(b[1].name, "ko"),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>내 학생</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">담당 학생이 아직 없습니다.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>학생</TableHead>
                <TableHead className="text-right">예약 수</TableHead>
                <TableHead className="text-right">남은 횟수</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(([id, info]) => (
                <TableRow key={id}>
                  <TableCell>{info.name}</TableCell>
                  <TableCell className="text-right">{info.count}회</TableCell>
                  <TableCell className="text-right">{info.remaining}회</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
