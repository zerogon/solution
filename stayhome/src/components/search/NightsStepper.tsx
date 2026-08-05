"use client";

import { Minus, Plus } from "lucide-react";

import { addDaysIso, formatKoMd } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export const MIN_NIGHTS = 1;
export const MAX_NIGHTS = 14;

/**
 * 숙박 일수 스테퍼.
 *
 * 체크아웃을 직접 입력받는 대신 `checkout = checkin + nights`로 파생시킨다.
 * 덕분에 기존의 "체크아웃은 체크인 이후여야 합니다" 검증 분기가 구조적으로
 * 불가능해진다 — 잘못된 조합을 만들 수 있는 입력이 아예 없다.
 */
export function NightsStepper({
  checkin,
  nights,
  onChange,
}: {
  checkin: string;
  nights: number;
  onChange: (next: number) => void;
}) {
  const checkout = addDaysIso(checkin, nights);

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">숙박</div>
        <div className="truncate font-mono text-sm tabular-nums">
          {formatKoMd(checkin)}
          <span className="mx-1 text-muted-foreground">→</span>
          {formatKoMd(checkout)}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="숙박 일수 줄이기"
          disabled={nights <= MIN_NIGHTS}
          onClick={() => onChange(Math.max(MIN_NIGHTS, nights - 1))}
        >
          <Minus className="size-3.5" />
        </Button>
        <span
          className="w-12 text-center font-mono text-sm font-semibold tabular-nums"
          aria-live="polite"
        >
          {nights}박
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="숙박 일수 늘리기"
          disabled={nights >= MAX_NIGHTS}
          onClick={() => onChange(Math.min(MAX_NIGHTS, nights + 1))}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
