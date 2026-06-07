import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgendaRail, type AgendaGroup } from "@/components/schedule/AgendaRail";
import { EmptyState } from "@/components/empty-state";
import { CalendarOff, CalendarPlus, Lock } from "lucide-react";
import { ReservationStatus } from "@/generated/prisma/enums";
import { canStudentCancel, formatKstDate, parseKstDate, kstHourOf } from "@/lib/slots";
import { listUnreadAnnouncements } from "@/lib/announcements";
import { AnnouncementPopup } from "@/components/announcements/AnnouncementPopup";
import { CancelButton } from "./_CancelButton";
import { VisibilitySettings } from "./_VisibilitySettings";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function dateTimeLabel(d: Date) {
  const dateStr = formatKstDate(d);
  const dow = DOW[new Date(parseKstDate(dateStr).getTime() + 9 * 3600000).getUTCDay()];
  return `${dateStr.slice(5).replace("-", ".")} (${dow}) ${String(kstHourOf(d)).padStart(2, "0")}:00`;
}

export default async function StudentHome() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const me = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!me) redirect("/login");

  const now = new Date();
  const allUpcoming = await prisma.reservation.findMany({
    where: {
      studentId: me.id,
      status: ReservationStatus.ACTIVE,
      slotDatetime: { gte: now },
    },
    include: { teacher: true },
    orderBy: { slotDatetime: "asc" },
  });
  const upcoming = allUpcoming.slice(0, 6);

  const unreadAnnouncements = await listUnreadAnnouncements(me.id);

  const groups: AgendaGroup[] = [
    {
      label: "다가오는 레슨",
      items: upcoming.map((r, i) => ({
        id: r.id,
        time: dateTimeLabel(r.slotDatetime),
        title: `${r.teacher.name} 선생님`,
        tone: i === 0 ? ("accent" as const) : ("default" as const),
        trailing: canStudentCancel(r.slotDatetime, now) ? (
          <CancelButton reservationId={r.id} />
        ) : (
          <Badge variant="outline">
            <Lock aria-hidden className="size-3" />
            마감
          </Badge>
        ),
      })),
    },
  ];

  return (
    <div className="space-y-5">
      {/* 안 읽은 공지 자동 팝업 (시각적 공간 차지 안 함) */}
      <AnnouncementPopup
        announcements={unreadAnnouncements.map((a) => ({
          id: a.id,
          title: a.title,
          content: a.content,
          isPinned: a.isPinned,
          publishedAt: a.publishedAt,
          createdAt: a.createdAt,
        }))}
      />

      {/* 상태 바 + 예약 CTA */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {me.name}님 · 남은 레슨
            </p>
            <p className="font-mono text-3xl font-semibold tracking-tight tabular-nums text-primary">
              {me.remainingLessons}
              <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
                회
              </span>
            </p>
          </div>
          <Link href="/student/book" className={buttonVariants({ size: "lg" })}>
            <CalendarPlus className="size-4" />
            예약하기
          </Link>
        </div>
        {me.enrollmentStart && me.enrollmentEnd && (
          <div className="border-t px-4 py-2 text-[11px] tabular-nums text-muted-foreground">
            등록기간 {formatKstDate(me.enrollmentStart).replace(/-/g, ".")} –{" "}
            {formatKstDate(me.enrollmentEnd).replace(/-/g, ".")}
          </div>
        )}
      </div>

      {/* 다가오는 레슨 타임라인 */}
      {upcoming.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={CalendarOff}
              title="예정된 레슨이 없습니다"
              description="예약하기에서 새 레슨을 예약해 보세요."
            />
          </CardContent>
        </Card>
      ) : (
        <AgendaRail groups={groups} />
      )}

      {/* 레슨 공개 설정 */}
      {allUpcoming.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>레슨 공개 설정</CardTitle>
          </CardHeader>
          <CardContent>
            <VisibilitySettings
              initial={allUpcoming.map((r) => ({
                id: r.id,
                label: dateTimeLabel(r.slotDatetime),
                teacherName: r.teacher.name,
                isPrivate: r.isPrivate,
              }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
