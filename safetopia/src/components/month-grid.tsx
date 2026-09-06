import type { ReactNode } from "react";

import type { HolidayOracle } from "@/lib/holidays-kr";
import { OUT_OF_MONTH_CELL, SHADED_DAY_CELL, isShadedDay, monthGrid } from "@/lib/calendar";
import { WEEKDAY_LABEL } from "@/lib/labels";
import { cn, parseDate } from "@/lib/utils";

export interface DayCtx {
  /** false면 앞뒤 달의 날짜 — 맥락용 칸이라 본문을 그리지 않는다. */
  inMonth: boolean;
  /** 공휴일명. 아니거나 커버리지 밖 연도면 null. */
  holiday: string | null;
  /** 토·일. 지점 문맥과 무관하다. */
  weekend: boolean;
  /** `closedWeekdays`에 든 요일. 소비처가 요일 규약을 다시 구현하지 않게 내려 준다. */
  closed: boolean;
  /** weekend || closed || holiday. 표시 전용 — `calendar.ts` 주석 참고. */
  shaded: boolean;
}

/**
 * 월 캘린더 껍데기 — 요일 헤더 + 일요일 시작 6주(42칸) 그리드 + 날짜 배지 + 공휴일 줄.
 * 서버 컴포넌트(훅 없음). 셀 본문은 `renderDay` 슬롯이 채운다.
 *
 * 직원 캘린더·관리자 캘린더·관리자 대시보드 모바일 셋이 공유한다. 음영 규칙이 여기 한 곳에만
 * 살아야 세 화면이 어긋나지 않는다.
 */
export function MonthGrid({
  ym,
  today,
  oracle,
  closedWeekdays = [],
  cellClassName = "min-h-20 sm:min-h-28",
  renderBadge,
  renderDay,
}: {
  ym: string;
  today: string;
  oracle: HolidayOracle;
  /** 지점 휴무 요일(`getUTCDay` 규약). 여러 지점을 합쳐 보는 화면은 비워 둔다. */
  closedWeekdays?: readonly number[];
  /** 셀 최소 높이 등 소비처별 크기. */
  cellClassName?: string;
  /** 날짜 배지 오른쪽 슬롯 — 인원수, "휴무" 같은 짧은 표시. */
  renderBadge?: (iso: string, ctx: DayCtx) => ReactNode;
  /** 셀 본문. 달 밖 칸에서는 호출하지 않는다. */
  renderDay?: (iso: string, ctx: DayCtx) => ReactNode;
}) {
  return (
    <>
      <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
        {WEEKDAY_LABEL.map((w, i) => (
          <div key={w} className={cn("py-1", i === 0 && "text-destructive/70")}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
        {monthGrid(ym).map(({ iso, inMonth }) => {
          const d = parseDate(iso);
          const holiday = oracle.covers(iso) && oracle.isHoliday(iso) ? oracle.nameOf(iso) : null;
          const dow = d.getUTCDay();
          const ctx: DayCtx = {
            inMonth,
            holiday,
            weekend: dow === 0 || dow === 6,
            closed: closedWeekdays.includes(dow),
            shaded: isShadedDay(iso, closedWeekdays, holiday),
          };
          const isToday = iso === today;
          return (
            <div
              key={iso}
              className={cn(
                "bg-background p-1 sm:p-1.5",
                cellClassName,
                // 순서가 곧 우선순위다 — tailwind-merge는 같은 속성에서 뒤엣것만 남긴다.
                // 달 밖 칸은 맥락일 뿐이라 음영보다 항상 뒤에 와서 이겨야 한다.
                ctx.shaded && inMonth && SHADED_DAY_CELL,
                !inMonth && OUT_OF_MONTH_CELL,
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    "inline-flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs tabular-nums",
                    isToday && "bg-foreground font-semibold text-background",
                    !isToday && (dow === 0 || holiday) && inMonth && "text-destructive",
                  )}
                >
                  {d.getUTCDate()}
                </span>
                {inMonth && renderBadge?.(iso, ctx)}
              </div>
              {holiday && inMonth && (
                <div className="mt-0.5 truncate text-[10px] text-destructive/80" title={holiday}>
                  {holiday}
                </div>
              )}
              {inMonth && renderDay?.(iso, ctx)}
            </div>
          );
        })}
      </div>
    </>
  );
}
