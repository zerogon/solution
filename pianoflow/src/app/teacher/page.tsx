import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { WeekStrip } from "@/components/schedule/WeekStrip";
import { DayTimeline, type TimelineItem } from "@/components/schedule/DayTimeline";
import { AgendaRail, type AgendaGroup } from "@/components/schedule/AgendaRail";
import { ReservationStatus } from "@/generated/prisma/enums";
import { Shield } from "lucide-react";
import { formatKstDate, parseKstDate, kstHourOf } from "@/lib/slots";
import { LessonFeedbackDialog } from "@/components/lesson-feedback-dialog";
import { cn } from "@/lib/utils";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function hm(d: Date) {
  return `${String(kstHourOf(d)).padStart(2, "0")}:00`;
}
function dowLabel(dateStr: string) {
  const kst = new Date(parseKstDate(dateStr).getTime() + 9 * 3600000);
  return DOW[kst.getUTCDay()];
}
function addDays(dateStr: string, n: number) {
  return formatKstDate(new Date(parseKstDate(dateStr).getTime() + n * 86400000));
}

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function TeacherHome({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const sp = await searchParams;
  const todayStr = formatKstDate(new Date());
  const selectedDate = sp.date ?? todayStr;

  const selKst = new Date(parseKstDate(selectedDate).getTime() + 9 * 3600000);
  const dow = selKst.getUTCDay();
  const mondayStr = addDays(selectedDate, dow === 0 ? -6 : 1 - dow);
  const weekStart = parseKstDate(mondayStr);
  const weekEnd = parseKstDate(addDays(mondayStr, 7));

  const week = await prisma.reservation.findMany({
    where: {
      teacherId: session.user.id,
      status: ReservationStatus.ACTIVE,
      slotDatetime: { gte: weekStart, lt: weekEnd },
    },
    include: { student: true },
    orderBy: { slotDatetime: "asc" },
  });

  const now = new Date();
  const selLabel = `${selectedDate.slice(5).replace("-", ".")} (${dowLabel(selectedDate)})`;
  const dayItems: TimelineItem[] = week
    .filter((r) => formatKstDate(r.slotDatetime) === selectedDate)
    .map((r) => ({
      hour: kstHourOf(r.slotDatetime),
      title: `${r.student.name} 학생`,
      subtitle: r.forcedByAdmin ? "강제 예약" : "레슨",
      tone: r.slotDatetime >= now ? "accent" : "muted",
      icon: r.forcedByAdmin ? (
        <Shield aria-hidden className="size-3.5 shrink-0 text-primary/70" />
      ) : undefined,
      trailing: (
        <LessonFeedbackDialog
          editable
          reservationId={r.id}
          studentName={r.student.name}
          whenLabel={`${selLabel} ${hm(r.slotDatetime)}`}
          initialFeedback={r.feedback ?? ""}
        />
      ),
    }));

  // 선택일을 제외한 그 주 나머지 일정
  const otherByDate = new Map<string, typeof week>();
  for (const r of week) {
    const d = formatKstDate(r.slotDatetime);
    if (d === selectedDate) continue;
    const arr = otherByDate.get(d) ?? [];
    arr.push(r);
    otherByDate.set(d, arr);
  }
  const weekGroups: AgendaGroup[] = Array.from(otherByDate.entries()).map(
    ([d, items]) => ({
      label: `${d.slice(5).replace("-", ".")} (${dowLabel(d)})`,
      items: items.map((r) => ({
        id: r.id,
        time: hm(r.slotDatetime),
        title: `${r.student.name} 학생`,
        tone: "default" as const,
        icon: r.forcedByAdmin ? (
          <Shield aria-hidden className="size-3.5 shrink-0 text-primary/70" />
        ) : undefined,
        trailing: (
          <LessonFeedbackDialog
            editable
            reservationId={r.id}
            studentName={r.student.name}
            whenLabel={`${d.slice(5).replace("-", ".")} (${dowLabel(d)}) ${hm(r.slotDatetime)}`}
            initialFeedback={r.feedback ?? ""}
          />
        ),
      })),
    }),
  );

  return (
    <div className="space-y-5">
      <PageHeader title="내 일정" description="주를 넘기며 날짜별 레슨을 확인하세요." />

      <WeekStrip selectedDateStr={selectedDate} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <section
          className={cn(
            "space-y-2",
            weekGroups.length === 0 && "lg:col-span-2",
          )}
        >
          <h2 className="px-0.5 text-sm font-medium text-muted-foreground">
            {selLabel}
            {selectedDate === todayStr && (
              <span className="ml-1.5 text-xs font-medium text-primary">오늘</span>
            )}
          </h2>
          <DayTimeline items={dayItems} emptyHint="이 날은 예약된 레슨이 없습니다." />
        </section>

        {weekGroups.length > 0 && (
          <section className="space-y-2">
            <h2 className="px-0.5 text-sm font-medium text-muted-foreground">
              이번 주 다른 일정
            </h2>
            <AgendaRail groups={weekGroups} />
          </section>
        )}
      </div>
    </div>
  );
}
