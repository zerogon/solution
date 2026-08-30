"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";

import { addDaysIso, formatKoMd } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { NightsStepper } from "./NightsStepper";
import { StayRangeCalendar, type StayRange } from "./StayRangeCalendar";

function rangeLabel(checkin: string, nights: number): string {
  return `${formatKoMd(checkin)} → ${formatKoMd(addDaysIso(checkin, nights))} · ${nights}박`;
}

/**
 * 날짜 선택 필드 — 폭에 따라 두 가지 표현.
 *
 * - `xl` 이상: 필터 패널 안에 캘린더를 그대로 펼친다.
 * - 그 미만: 날짜 요약 버튼 → 바텀 시트. 월 그리드가 ~360px라 화면 절반만 덮으므로
 *   뒤의 결과가 계속 보인다.
 *
 * 미디어쿼리 훅이 아니라 CSS로만 분기한다 (hydration 불일치 없음). 양쪽 모두
 * 마운트되지만 상태는 전부 부모에 있어 항상 동기화된다.
 */
export function DateRangeField({
  checkin,
  nights,
  today,
  onChange,
  onSearch,
}: {
  checkin: string;
  nights: number;
  today: string;
  onChange: (next: StayRange) => void;
  /** 시트 푸터의 "이 날짜로 조회" — 시트를 닫으면서 곧바로 조회한다. */
  onSearch: () => void;
}) {
  // 첫 탭 직후인지. 시트를 닫으면 초기화해 다음 열람이 "체크인 고르기"로 시작하게 한다.
  const [awaitingCheckout, setAwaitingCheckout] = useState(false);

  const calendar = (
    <StayRangeCalendar
      checkin={checkin}
      nights={nights}
      today={today}
      onChange={onChange}
      awaitingCheckout={awaitingCheckout}
      onAwaitingCheckoutChange={setAwaitingCheckout}
    />
  );

  return (
    <>
      <div className="hidden xl:block">{calendar}</div>

      <div className="xl:hidden">
        <Sheet
          onOpenChange={(open) => {
            if (!open) setAwaitingCheckout(false);
          }}
        >
          <SheetTrigger
            render={
              <Button variant="outline" className="w-full justify-start" />
            }
          >
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
            <span className="font-mono tabular-nums">
              {rangeLabel(checkin, nights)}
            </span>
          </SheetTrigger>

          <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>날짜 선택</SheetTitle>
              <SheetDescription className="font-mono tabular-nums">
                {rangeLabel(checkin, nights)}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-3 px-4">
              {calendar}
              <NightsStepper
                checkin={checkin}
                nights={nights}
                onChange={(next) => {
                  setAwaitingCheckout(false);
                  onChange({ checkin, nights: next });
                }}
              />
            </div>

            <SheetFooter>
              <SheetClose render={<Button onClick={onSearch} />}>
                이 날짜로 조회
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
