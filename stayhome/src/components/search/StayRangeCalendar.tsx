"use client";

import { useState } from "react";

import {
  addDaysIso,
  addMonthsIso,
  diffDaysIso,
  parseDate,
  startOfMonthIso,
} from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { MAX_NIGHTS, MIN_NIGHTS } from "./NightsStepper";

/** 캘린더에서 이동 가능한 최대 개월 수. */
const MONTHS_AHEAD = 12;

export type StayRange = { checkin: string; nights: number };

/**
 * 숙박 기간 선택 월 캘린더.
 *
 * ## 상태 모델 — `checkin` + `nights`가 단일 진실
 * 캘린더는 그 *뷰*일 뿐이다. `selected`는 언제나
 * `{from: checkin, to: checkin + nights}`인 완결된 범위라, 앱 상태에
 * `to: undefined`가 존재하는 순간이 없다.
 *
 * ## RDP의 range 대수에 위임하지 않는 이유
 * `resetOnSelect`/`min`/`max`를 쓰면 첫 클릭 후 `{from, to: undefined}`라는 무효
 * 상태가 생기고, 조회 버튼·쿼리 키·stale 비교가 전부 그걸 방어해야 한다.
 * `selected`가 완전 제어이므로 RDP가 계산한 범위는 어차피 무시된다 — 클릭된 날
 * (`onSelect`의 2번째 인자 `triggerDate`)만 읽고 우리가 직접 해석한다.
 * `NightsStepper`가 "체크아웃 < 체크인을 구조적으로 불가능하게" 만든 것과 같은 판단이다.
 *
 * ## 한 번만 탭해도 유효하다
 * 첫 탭 뒤 상태는 `{checkin: 탭한 날, nights: 이전값(1..14)}`이라, 곧바로 조회를
 * 눌러도 언제나 유효한 요청이 나간다. disabled 상태도 토스트도 검증 분기도 없다.
 */
export function StayRangeCalendar({
  checkin,
  nights,
  today,
  onChange,
  awaitingCheckout,
  onAwaitingCheckoutChange,
}: {
  checkin: string;
  nights: number;
  /** KST 오늘 ("YYYY-MM-DD"). 과거 날짜와 이동 하한을 정한다. */
  today: string;
  onChange: (next: StayRange) => void;
  /** 첫 탭 직후(= 다음 탭을 체크아웃으로 해석할 상태)인지. */
  awaitingCheckout: boolean;
  onAwaitingCheckoutChange: (next: boolean) => void;
}) {
  const [month, setMonth] = useState(() => parseDate(startOfMonthIso(checkin)));

  const checkout = addDaysIso(checkin, nights);

  return (
    <div className="rounded-lg border bg-card p-3">
      <Calendar
        mode="range"
        selected={{ from: parseDate(checkin), to: parseDate(checkout) }}
        month={month}
        onMonthChange={setMonth}
        startMonth={parseDate(startOfMonthIso(today))}
        endMonth={parseDate(addMonthsIso(today, MONTHS_AHEAD))}
        disabled={{ before: parseDate(today) }}
        numberOfMonths={1}
        onSelect={(_range, triggerDate) => {
          // timeZone="utc"라 이 Date는 UTC 자정이고 그대로 ISO 날짜가 된다.
          const iso = triggerDate.toISOString().slice(0, 10);
          if (iso < today) return;

          const asNights = diffDaysIso(checkin, iso);
          if (
            awaitingCheckout &&
            asNights >= MIN_NIGHTS &&
            asNights <= MAX_NIGHTS
          ) {
            // 두 번째 탭 = 체크아웃.
            onChange({ checkin, nights: asNights });
            onAwaitingCheckoutChange(false);
            return;
          }

          // 첫 탭, 또는 14박 창 밖의 탭 = 새 체크인 (박수는 보존).
          // 3주 뒤를 누른 사람의 의도는 "21박"이 아니라 "그 날로 옮기기"다.
          onChange({ checkin: iso, nights });
          onAwaitingCheckoutChange(true);
        }}
      />

      <p className="pt-2 text-center text-xs text-muted-foreground">
        {awaitingCheckout
          ? `체크아웃 날짜를 고르세요 (최대 ${MAX_NIGHTS}박)`
          : "날짜를 누르면 체크인이 바뀝니다"}
      </p>
    </div>
  );
}
