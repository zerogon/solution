import Link from "next/link";
import { Pencil } from "lucide-react";

import { LEAVE_TYPE_LABEL, formatDays } from "@/lib/labels";
import { cn, formatKoRange } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LeaveType } from "@/generated/prisma/enums";

export interface YearEntryRow {
  id: string;
  type: LeaveType;
  startIso: string;
  endIso: string;
  days: number;
  manualDays: boolean;
  memo: string | null;
}

/**
 * 캘린더 아래 그 해(보고 있는 달의 연도, 1.1~12.31) 기록 목록. 시작 달별로 묶는다.
 * 합계는 **시작일이 그 해인 기록**만 센다 — 해를 걸친 기록이 두 번 세어지지 않게(회차 귀속 `periodIndexFor`와 같은 기준).
 * 행을 누르면 그 기록의 달로 이동만 하고, 수정 창(`?entry=id`)은 행 끝 연필 버튼으로 따로 연다. 보고 있는 달의 묶음은 강조한다.
 */
export function YearEntryList({ entries, year, ym }: { entries: YearEntryRow[]; year: number; ym: string }) {
  const yearFirst = `${year}-01-01`;
  const own = entries.filter((e) => e.startIso >= yearFirst);
  const total = own.reduce((sum, e) => sum + e.days, 0);

  // 시작 달별 묶음. 작년에 시작한 기록은 1월 묶음에 둔다.
  const groups = new Map<string, YearEntryRow[]>();
  for (const e of entries) {
    const key = e.startIso < yearFirst ? `${year}-01` : e.startIso.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }

  return (
    <section className="@container space-y-2">
      <h2 className="flex items-baseline gap-2 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{year}년 사용</span>
        <span className="font-mono text-base font-semibold tabular-nums text-primary">{formatDays(total)}</span>
        <span>· {own.length}건</span>
      </h2>
      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          {year}년에 등록된 연차가 없습니다.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-background">
          {[...groups].map(([key, rows]) => {
            const current = key === ym;
            const monthDays = rows.filter((e) => e.startIso >= yearFirst).reduce((sum, e) => sum + e.days, 0);
            return (
              <div
                key={key}
                className={cn(
                  "border-b last:border-b-0",
                  // 테두리는 위에 덮는 가상 요소로 — inset 그림자는 머리줄·행 배경에 가려진다.
                  current &&
                    "relative after:pointer-events-none after:absolute after:inset-0 after:border-2 after:border-primary first:after:rounded-t-lg last:after:rounded-b-lg",
                )}
              >
                <div
                  className={cn(
                    "flex items-baseline justify-between bg-muted/60 px-3 py-1.5 text-xs font-semibold text-muted-foreground",
                    current && "bg-primary/10 text-primary",
                  )}
                >
                  <span>{Number(key.slice(5))}월</span>
                  <span className="font-mono tabular-nums">{formatDays(monthDays)}</span>
                </div>
                <ul className="divide-y">
                  {rows.map((e) => {
                    const half = e.type !== LeaveType.FULL_DAY;
                    return (
                      <li key={e.id} className="flex items-center hover:bg-muted">
                        {/* 달 이동은 스크롤을 맨 위로 — 모바일에서 목록이 달력 아래라 이동한 달이 보이게. */}
                        <Link
                          href={`/calendar?m=${key}`}
                          aria-current={current ? "page" : undefined}
                          className="grid min-w-0 flex-1 grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 py-2.5 pl-3 text-sm @2xl:grid-cols-[11rem_7rem_1fr_auto]"
                        >
                          <span className="font-mono tabular-nums">
                            {formatKoRange(e.startIso, e.endIso)}
                            {e.startIso < yearFirst && <span className="ml-1.5 font-sans text-xs text-muted-foreground">작년부터</span>}
                          </span>
                          <span className="text-right font-mono font-semibold tabular-nums @2xl:order-4">{formatDays(e.days)}</span>
                          {/* 좁으면(모바일·달력 옆) 유형·메모가 둘째 줄로, 목록 폭이 42rem 이상이면 `contents`로 풀려 각자 열을 갖는다. */}
                          <span className="col-span-2 flex min-w-0 items-center gap-2 @2xl:contents">
                            <span className="flex shrink-0 items-center gap-1.5 @2xl:order-2">
                              <span
                                className={cn(
                                  "inline-flex rounded px-1.5 py-0.5 text-xs font-medium",
                                  half ? "border-l-2 border-primary bg-primary/10 text-foreground" : "bg-primary text-primary-foreground",
                                )}
                              >
                                {LEAVE_TYPE_LABEL[e.type]}
                              </span>
                              {e.manualDays && <span className="text-xs text-muted-foreground">직접</span>}
                            </span>
                            <span className="min-w-0 truncate text-muted-foreground @2xl:order-3">{e.memo}</span>
                          </span>
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="mx-1.5 shrink-0 text-muted-foreground"
                          render={<Link href={`/calendar?m=${key}&entry=${e.id}`} scroll={false} />}
                          nativeButton={false}
                          aria-label={`${formatKoRange(e.startIso, e.endIso)} 연차 고치기`}
                        >
                          <Pencil />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
