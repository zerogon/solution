import { Users } from "lucide-react";

import { LeaveType } from "@/generated/prisma/enums";
import type { BoardGroup } from "@/lib/schedule-board";
import { LEAVE_TYPE_LABEL, WEEKDAY_LABEL, formatDays } from "@/lib/labels";
import { cn, parseDate } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * 날짜 열 폭(w-8 = 32px). 한 달 31일이면 31×32 + 96(이름) + 144(잔여) = 1232px 로
 * 본문 최대 폭(88rem − px-8×2 = 1344px) 안에 들어간다. 36px로 키우면 넘친다.
 */
const DAY_COL = "w-8 px-0 text-center";

/**
 * 고정 열은 가로 스크롤되는 셀 **위에** 겹치므로 배경이 반드시 불투명해야 한다.
 * 그래서 반투명 유틸(`bg-muted/50`, `bg-muted/20`)을 그대로 못 쓰고, 같은 색을 카드 배경 위에
 * 미리 섞은 불투명 값으로 만든다 — 행 hover 색과 합계 행 색 둘 다.
 */
// 문자열 리터럴이어야 한다 — Tailwind는 조합해서 만든 클래스명을 스캔하지 못한다.
const STICKY = "sticky z-10 bg-card group-hover:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]";
const STICKY_TOTAL = "sticky z-10 bg-[color-mix(in_oklab,var(--muted)_20%,var(--card))]";

/**
 * 직원×날짜 스케줄 격자(지점별 카드). 서버 컴포넌트 — 훅 없음, props는 평면 객체만.
 * 색은 primary(휴가)·muted(휴무/공휴일 열)·destructive(일·공휴일 헤더)만 쓴다.
 * 한 달이 한 화면에 안 들어가면 표 안에서 가로로 스크롤하고, 이름·잔여 열은 양끝에 고정된다.
 */
export function LeaveScheduleBoard({
  days,
  today,
  groups,
  holidays,
}: {
  days: string[];
  today: string;
  groups: BoardGroup[];
  /** iso → 공휴일명(없으면 null). */
  holidays: Record<string, string | null>;
}) {
  if (groups.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState icon={Users} title="재직 직원이 없습니다" description="직원을 등록하면 지점별 휴가 일정이 여기에 표시됩니다." />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const closed = new Set(g.branch?.closedWeekdays ?? []);
        const isOffDay = (iso: string) => closed.has(parseDate(iso).getUTCDay()) || holidays[iso] != null;
        return (
          <Card key={g.branch?.id ?? "none"}>
            <CardContent className="p-0">
              <div className="flex items-baseline gap-2 px-4 pt-3 pb-1">
                <h3 className="font-heading text-base font-semibold">{g.branch?.name ?? "소속 없음"}</h3>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">{g.members.length}명</span>
              </div>
              {/* min-w-max: w-full이면 좁은 화면에서 열이 찌그러진다. 넘치는 만큼 컨테이너가 스크롤한다. */}
              <Table className="min-w-max">
                <TableHeader>
                  <TableRow className="group">
                    <TableHead className={cn(STICKY, "left-0 w-24 border-r pl-4")}>이름</TableHead>
                    {days.map((iso) => {
                      const d = parseDate(iso);
                      const holiday = holidays[iso];
                      const isToday = iso === today;
                      return (
                        <TableHead
                          key={iso}
                          className={cn(DAY_COL, "h-auto py-1.5 align-top", isOffDay(iso) && "bg-muted/40")}
                          title={holiday ?? undefined}
                        >
                          <div
                            className={cn(
                              "mx-auto flex size-6 items-center justify-center rounded-full font-mono text-xs leading-none tabular-nums",
                              isToday && "bg-foreground font-semibold text-background",
                              !isToday && (d.getUTCDay() === 0 || holiday) && "text-destructive",
                            )}
                          >
                            {d.getUTCDate()}
                          </div>
                          <div className={cn("mt-0.5 text-[10px] font-normal leading-none", d.getUTCDay() === 0 && "text-destructive/70")}>
                            {WEEKDAY_LABEL[d.getUTCDay()]}
                          </div>
                        </TableHead>
                      );
                    })}
                    <TableHead className={cn(STICKY, "right-0 w-36 border-l pr-4 text-right")}>잔여</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {g.members.map((m) => (
                    <TableRow key={m.id} className="group">
                      <TableCell className={cn(STICKY, "left-0 truncate border-r pl-4 font-medium")}>{m.name}</TableCell>
                      {days.map((iso) => {
                        const type = m.cells[iso];
                        return (
                          <TableCell key={iso} className={cn(DAY_COL, "py-1.5", isOffDay(iso) && "bg-muted/40")}>
                            {type ? (
                              <LeaveCell type={type} title={`${m.name} · ${LEAVE_TYPE_LABEL[type]}`} />
                            ) : (
                              <span className="block text-center text-muted-foreground/40">·</span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className={cn(STICKY, "right-0 border-l pr-4 text-right")}>
                        <RemainingCell summary={m.summary} />
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/20 hover:bg-muted/20">
                    <TableCell className={cn(STICKY_TOTAL, "left-0 border-r pl-4 text-xs text-muted-foreground")}>휴가</TableCell>
                    {days.map((iso) => {
                      const n = g.offByDay[iso];
                      return (
                        <TableCell
                          key={iso}
                          className={cn(DAY_COL, "py-1.5 font-mono text-xs tabular-nums", isOffDay(iso) && "bg-muted/40")}
                        >
                          {n ? <span className="text-foreground">{n}</span> : <span className="text-muted-foreground/40">·</span>}
                        </TableCell>
                      );
                    })}
                    <TableCell className={cn(STICKY_TOTAL, "right-0 border-l")} />
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** 연차 = 꽉 찬 블록, 오전 반차 = 왼쪽 절반, 오후 반차 = 오른쪽 절반. */
function LeaveCell({ type, title }: { type: LeaveType; title: string }) {
  return (
    <div className="mx-auto h-5 w-5 overflow-hidden rounded-sm bg-primary/15" title={title} aria-label={title}>
      <div
        className={cn(
          "h-full bg-primary",
          type === LeaveType.FULL_DAY && "w-full",
          type === LeaveType.AM_HALF && "w-1/2",
          type === LeaveType.PM_HALF && "ml-auto w-1/2",
        )}
      />
    </div>
  );
}

function RemainingCell({ summary }: { summary: BoardGroup["members"][number]["summary"] }) {
  if (!summary) return <span className="text-xs text-muted-foreground">미부여</span>;
  const ratio = summary.total > 0 ? Math.max(0, Math.min(1, summary.remaining / summary.total)) : 0;
  return (
    <div className="inline-flex flex-col items-end gap-1">
      <span className="font-mono text-sm tabular-nums">
        <span className="font-semibold">{formatDays(summary.remaining)}</span>
        <span className="text-muted-foreground"> / {summary.total}</span>
      </span>
      <div className="ml-auto h-1 w-20 overflow-hidden rounded-full bg-primary/15">
        <div className="h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
