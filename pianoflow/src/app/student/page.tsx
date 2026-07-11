import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AgendaRail, type AgendaGroup } from "@/components/schedule/AgendaRail";
import { EmptyState } from "@/components/empty-state";
import { CalendarOff, CalendarPlus, Lock, Repeat } from "lucide-react";
import { ReservationStatus } from "@/generated/prisma/enums";
import { canStudentCancel, formatKstDate, parseKstDate, kstHourOf } from "@/lib/slots";
import { ensureRecurringMaterialized } from "@/lib/recurring";
import { listUnreadAnnouncements } from "@/lib/announcements";
import { AnnouncementPopup } from "@/components/announcements/AnnouncementPopup";
import { CancelButton } from "./_CancelButton";
import { VisibilitySettings } from "./_VisibilitySettings";
import { NextLessonCard } from "./_NextLessonCard";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function dateLabel(d: Date) {
  const dateStr = formatKstDate(d);
  const dow = DOW[new Date(parseKstDate(dateStr).getTime() + 9 * 3600000).getUTCDay()];
  return `${dateStr.slice(5).replace("-", ".")} (${dow})`;
}

function dateTimeLabel(d: Date) {
  return `${dateLabel(d)} ${String(kstHourOf(d)).padStart(2, "0")}:00`;
}

/** KST 자정 기준 날짜 차이(일) */
function kstDaysBetween(from: Date, to: Date) {
  return Math.round(
    (parseKstDate(formatKstDate(to)).getTime() -
      parseKstDate(formatKstDate(from)).getTime()) /
      86_400_000,
  );
}

export default async function StudentHome() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const me = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!me) redirect("/login");

  await ensureRecurringMaterialized();

  const now = new Date();
  const daysLeft = me.enrollmentEnd ? kstDaysBetween(now, me.enrollmentEnd) : null;
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

  const [next, ...rest] = upcoming;

  const cancelOrLocked = (r: (typeof upcoming)[number]) =>
    canStudentCancel(r.slotDatetime, now) ? (
      <CancelButton reservationId={r.id} />
    ) : (
      <Badge variant="outline">
        <Lock aria-hidden className="size-3" />
        마감
      </Badge>
    );

  const groups: AgendaGroup[] = [
    {
      label: "이후 레슨",
      items: rest.map((r) => ({
        id: r.id,
        time: dateTimeLabel(r.slotDatetime),
        title: `${r.teacher.name} 선생님`,
        icon: r.recurringId ? (
          <Repeat aria-hidden className="size-3.5 shrink-0 text-primary/70" />
        ) : undefined,
        trailing: cancelOrLocked(r),
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
        {me.enrollmentEnd && daysLeft !== null && (
          <div className="flex items-center justify-between gap-3 border-t px-4 py-2 text-[11px] tabular-nums text-muted-foreground">
            <span>
              {me.enrollmentStart
                ? `등록기간 ${formatKstDate(me.enrollmentStart).replace(/-/g, ".")} – ${formatKstDate(me.enrollmentEnd).replace(/-/g, ".")}`
                : `마감일 ${formatKstDate(me.enrollmentEnd).replace(/-/g, ".")}`}
            </span>
            {daysLeft < 0 ? (
              <span className="font-medium text-destructive">마감됨</span>
            ) : daysLeft === 0 ? (
              <span className="font-medium text-destructive">오늘 마감</span>
            ) : daysLeft <= 7 ? (
              <span className="font-mono font-medium text-amber-600">
                마감 D-{daysLeft}
              </span>
            ) : (
              <span className="font-mono font-medium text-primary">
                D-{daysLeft}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 다가오는 레슨 + 공개 설정 */}
      {!next ? (
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
        <>
          <NextLessonCard
            dateLabel={dateLabel(next.slotDatetime)}
            timeLabel={`${String(kstHourOf(next.slotDatetime)).padStart(2, "0")}:00`}
            teacherName={next.teacher.name}
            daysUntil={kstDaysBetween(now, next.slotDatetime)}
            action={cancelOrLocked(next)}
            isRecurring={next.recurringId != null}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
            {rest.length > 0 && <AgendaRail groups={groups} />}

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
          </div>
        </>
      )}
    </div>
  );
}
