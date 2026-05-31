import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReservationStatus } from "@/generated/prisma/enums";
import { canStudentCancel, formatKstDate } from "@/lib/slots";
import { CancelButton } from "../_CancelButton";

function formatKstHM(d: Date) {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${String(kst.getUTCHours()).padStart(2, "0")}:00`;
}

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const all = await prisma.reservation.findMany({
    where: { studentId: session.user.id },
    include: { teacher: true },
    orderBy: { slotDatetime: "desc" },
    take: 50,
  });

  const now = new Date();

  return (
    <Card>
      <CardHeader>
        <CardTitle>예약 내역</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {all.length === 0 ? (
          <p className="text-sm text-muted-foreground">예약 내역이 없습니다.</p>
        ) : (
          all.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <div>
                <div className="text-sm font-medium">
                  {formatKstDate(r.slotDatetime)} {formatKstHM(r.slotDatetime)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.teacher.name} 선생님
                </div>
              </div>
              <div className="flex items-center gap-2">
                {r.status === ReservationStatus.CANCELLED ? (
                  <Badge variant="outline">취소됨</Badge>
                ) : r.slotDatetime < now ? (
                  <Badge variant="secondary">완료</Badge>
                ) : canStudentCancel(r.slotDatetime, now) ? (
                  <CancelButton reservationId={r.id} />
                ) : (
                  <Badge variant="outline">마감</Badge>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
