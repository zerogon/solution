"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { addMonth } from "@/lib/month";
import {
  getMonthlyTeacherLessons,
  type MonthlyLessons,
} from "@/actions/admin-stats";

interface Props {
  initial: MonthlyLessons;
  currentMonth: string;
}

export function MonthlyTeacherLessons({ initial, currentMonth }: Props) {
  const [data, setData] = useState<MonthlyLessons>(initial);
  const [pending, startTransition] = useTransition();

  function load(nextMonth: string) {
    startTransition(async () => {
      try {
        const res = await getMonthlyTeacherLessons(nextMonth);
        setData(res);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "데이터를 불러오지 못했습니다.",
        );
      }
    });
  }

  const { month, rows, total, max } = data;
  const [yy, mm] = month.split("-");
  const monthLabel = `${yy}년 ${Number(mm)}월`;
  const isCurrent = month === currentMonth;

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>월별 선생님별 레슨</CardTitle>
          <span className="text-sm text-muted-foreground">총 {total}건</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => load(addMonth(month, -1))}
            disabled={pending}
            aria-label="이전 달"
            className={buttonVariants({ size: "icon-sm", variant: "outline" })}
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-24 text-center text-sm font-medium">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => load(addMonth(month, 1))}
            disabled={pending}
            aria-label="다음 달"
            className={buttonVariants({ size: "icon-sm", variant: "outline" })}
          >
            <ChevronRight className="size-4" />
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = String(
                new FormData(e.currentTarget).get("month") ?? "",
              );
              if (value) load(value);
            }}
            className="flex items-center gap-2"
          >
            <input
              type="month"
              name="month"
              defaultValue={month}
              key={month}
              className="h-7 rounded-md border bg-transparent px-2.5 text-sm transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            />
            <button
              type="submit"
              disabled={pending}
              className={buttonVariants({ size: "sm" })}
            >
              적용
            </button>
          </form>
          {!isCurrent && (
            <button
              type="button"
              onClick={() => load(currentMonth)}
              disabled={pending}
              className={buttonVariants({ size: "sm", variant: "ghost" })}
            >
              이번 달
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-xs text-muted-foreground">
          {monthLabel} 활성화된 예약 기준 (취소 제외)
        </p>
        {rows.length === 0 ? (
          <EmptyState icon={Users} title="선생님이 없습니다" />
        ) : (
          <div
            className={`space-y-3.5 transition-opacity ${pending ? "opacity-50" : ""}`}
          >
            {rows.map((r) => (
              <div key={r.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{r.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {r.count}건
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(r.count / max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
