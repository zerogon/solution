"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { bookingHorizon, formatKstDate, parseKstDate } from "@/lib/slots";

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function addDays(dateStr: string, n: number): string {
  const d = parseKstDate(dateStr);
  return formatKstDate(new Date(d.getTime() + n * 86400000));
}
function kstParts(dateStr: string) {
  const kst = new Date(parseKstDate(dateStr).getTime() + 9 * 3600000);
  return { dow: kst.getUTCDay(), date: kst.getUTCDate(), month: kst.getUTCMonth() + 1 };
}

export function WeekStrip({ selectedDateStr }: { selectedDateStr: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { dow } = kstParts(selectedDateStr);
  const mondayStr = addDays(selectedDateStr, dow === 0 ? -6 : 1 - dow);
  const days = Array.from({ length: 7 }, (_, i) => addDays(mondayStr, i));
  const todayStr = formatKstDate(new Date());

  // 예약 가능 창: 이번 주 ~ 4주차. 창 밖으로 넘어가는 주 이동 화살표는 잠근다.
  const { mondayStr: thisWeekMonday, maxDateStr } = bookingHorizon(new Date());
  const prevDisabled = mondayStr <= thisWeekMonday;
  const nextDisabled = addDays(mondayStr, 7) > maxDateStr;

  const firstP = kstParts(days[0]);
  const lastP = kstParts(days[6]);
  const rangeLabel =
    firstP.month === lastP.month
      ? `${firstP.month}월 ${firstP.date}–${lastP.date}일`
      : `${firstP.month}월 ${firstP.date}일 – ${lastP.month}월 ${lastP.date}일`;

  const hrefFor = (date: string) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("date", date);
    return `${pathname}?${sp.toString()}`;
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between px-3 py-2.5">
        {prevDisabled ? (
          <span
            aria-disabled
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground/40"
          >
            <ChevronLeft className="size-4" />
          </span>
        ) : (
          <Link
            href={hrefFor(addDays(selectedDateStr, -7))}
            aria-label="이전 주"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </Link>
        )}
        <span className="text-sm font-medium tabular-nums">{rangeLabel}</span>
        {nextDisabled ? (
          <span
            aria-disabled
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground/40"
          >
            <ChevronRight className="size-4" />
          </span>
        ) : (
          <Link
            href={hrefFor(addDays(selectedDateStr, 7))}
            aria-label="다음 주"
            className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </Link>
        )}
      </div>
      <div className="grid grid-cols-7 border-t">
        {days.map((day) => {
          const p = kstParts(day);
          const selected = day === selectedDateStr;
          const isToday = day === todayStr;
          const isSun = p.dow === 0;
          const isSat = p.dow === 6;
          const isWeekend = isSat || isSun;
          return (
            <Link
              key={day}
              href={hrefFor(day)}
              aria-current={selected ? "date" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 py-2.5 text-center transition-colors",
                !selected && isWeekend && "bg-muted/60",
                !selected && "hover:bg-muted",
              )}
            >
              <span
                className={cn(
                  "text-[11px] font-medium",
                  selected
                    ? "text-primary"
                    : isSun
                      ? "text-destructive/70"
                      : isSat
                        ? "text-chart-4"
                        : "text-muted-foreground",
                )}
              >
                {DOW[p.dow]}
              </span>
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full font-mono text-sm tabular-nums transition-colors",
                  selected
                    ? "bg-primary font-semibold text-primary-foreground"
                    : "text-foreground",
                  !selected && isToday && "ring-1 ring-primary/40",
                )}
              >
                {p.date}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
