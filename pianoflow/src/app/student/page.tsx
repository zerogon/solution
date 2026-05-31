import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ReservationStatus } from "@/generated/prisma/enums";
import { canStudentCancel, formatKstDate } from "@/lib/slots";
import { CancelButton } from "./_CancelButton";
import { VisibilitySwitch } from "./_VisibilitySwitch";

function formatKstHourMinute(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const h = String(kst.getUTCHours()).padStart(2, "0");
  return `${h}:00`;
}

export default async function StudentHome() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!me) redirect("/login");

  const now = new Date();
  // 예정 레슨 전체 (공개 설정 섹션에서 전체 관리)
  const allUpcoming = await prisma.reservation.findMany({
    where: {
      studentId: me.id,
      status: ReservationStatus.ACTIVE,
      slotDatetime: { gte: now },
    },
    include: { teacher: true },
    orderBy: { slotDatetime: "asc" },
  });
  const upcoming = allUpcoming.slice(0, 5);
  const next = upcoming[0];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>안녕하세요, {me.name}님</CardTitle>
          <CardDescription>오늘도 즐거운 레슨 되세요.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary" className="text-sm">
            남은 레슨: {me.remainingLessons}회
          </Badge>
          <Link href="/student/book" className={buttonVariants({ size: "lg" })}>
            예약하기
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>다음 레슨</CardTitle>
        </CardHeader>
        <CardContent>
          {next ? (
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-semibold">
                  {formatKstDate(next.slotDatetime)} {formatKstHourMinute(next.slotDatetime)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {next.teacher.name} 선생님
                </div>
              </div>
              {canStudentCancel(next.slotDatetime, now) ? (
                <CancelButton reservationId={next.id} />
              ) : (
                <Badge variant="outline">마감</Badge>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">예정된 레슨이 없습니다.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>예정 예약</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">예약이 없습니다.</p>
          ) : (
            upcoming.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div>
                  <div className="text-sm font-medium">
                    {formatKstDate(r.slotDatetime)} {formatKstHourMinute(r.slotDatetime)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.teacher.name} 선생님
                  </div>
                </div>
                {canStudentCancel(r.slotDatetime, now) ? (
                  <CancelButton reservationId={r.id} />
                ) : (
                  <Badge variant="outline">마감</Badge>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>레슨 공개 설정</CardTitle>
          <CardDescription>
            다른 학생에게 내 레슨 일정 공개 여부를 설정합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {allUpcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              설정할 예정 레슨이 없습니다.
            </p>
          ) : (
            allUpcoming.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div>
                  <div className="text-sm font-medium">
                    {formatKstDate(r.slotDatetime)}{" "}
                    {formatKstHourMinute(r.slotDatetime)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.teacher.name} 선생님
                  </div>
                </div>
                <VisibilitySwitch
                  reservationId={r.id}
                  isPrivate={r.isPrivate}
                />
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
