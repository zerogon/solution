"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import { ko } from "react-day-picker/locale/ko";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/**
 * 월 캘린더 — `react-day-picker`를 앱 토큰으로 감싼 것.
 *
 * ## `timeZone="utc"`는 장식이 아니다
 * 앱 전체가 "YYYY-MM-DD 문자열 ↔ `parseDate()`(UTC 자정 Date)" 규약을 쓴다
 * (`src/lib/utils.ts`). RDP는 `timeZone`이 주어지면 `today`/`month`/`selected`/
 * `disabled`를 `TZDate(date, tz)`로 감싸 **epoch을 보존**하므로, `parseDate()`가 만든
 * Date가 그대로 왕복하고 `onSelect`가 돌려주는 Date도
 * `toISOString().slice(0,10) === iso`를 만족한다. 이걸 빼면 브라우저 로컬 타임존이
 * 끼어들어 UTC-9(한국 서버 기준 새벽) 환경에서 하루씩 밀린다. **바꾸지 말 것.**
 *
 * ## `react-day-picker/style.css`를 import 하지 않는 이유
 * v10은 `{...getDefaultClassNames(), ...props.classNames}`로 병합하므로 아래에서 덮어쓴
 * 키는 `rdp-*` 클래스를 잃는다. 즉 번들 스타일시트는 죽은 규칙 + 토큰 체계와 충돌하는
 * `--rdp-accent-color: blue`, 44px 하드코딩 셀 크기만 남긴다.
 *
 * ## 클래스 충돌 주의
 * RDP는 modifier 클래스들을 `join(" ")`할 뿐 `twMerge`를 돌리지 않는다. 같은 요소에
 * 상충하는 Tailwind 유틸리티를 두면 승자가 스타일시트 순서로 결정돼 불안정하다.
 * 그래서 (a) 주말 색은 날짜 셀이 아니라 요일 헤더(`weekday`)에만 두고,
 * (b) 선택 스타일은 `<td>`가 아니라 `[&>button]`으로 버튼을 겨냥한다.
 */
export function Calendar({ className, classNames, ...props }: DayPickerProps) {
  return (
    <DayPicker
      locale={ko}
      timeZone="utc"
      weekStartsOn={0}
      showOutsideDays={false}
      className={cn("w-full", className)}
      classNames={{
        root: "w-full",
        months: "relative flex flex-col gap-4",
        month: "flex w-full flex-col gap-2",
        // 기본 <nav>를 캡션 줄 위에 겹쳐 좌우 끝으로 민다 (month_caption h-7 = 버튼 size-7).
        // `navLayout="around"`를 쓰면 안 된다 — 그 모드는 <nav>를 건너뛰고 버튼을
        // month의 직계 자식으로 흘려보내서 이 클래스가 아무 데도 안 붙는다.
        nav: "absolute inset-x-0 top-0 flex items-center justify-between",
        // RDP 네비 버튼은 `disabled`가 아니라 `aria-disabled`를 쓴다.
        button_previous: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "aria-disabled:pointer-events-none aria-disabled:opacity-30",
        ),
        button_next: cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          "aria-disabled:pointer-events-none aria-disabled:opacity-30",
        ),
        chevron: "size-4",
        month_caption: "flex h-7 items-center justify-center",
        caption_label: "font-heading text-sm font-semibold tracking-tight",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        // first/last = 일/토 (weekStartsOn=0). 날짜 셀이 아니라 여기에만 주말 색을 둔다.
        weekday:
          "flex-1 pb-1 text-[11px] font-normal text-muted-foreground first:text-destructive/70 last:text-chart-2",
        week: "flex w-full",
        // flex-1 + 셀 간 간격 0 → range_middle의 bg-accent가 끊기지 않는 바가 된다.
        day: "relative flex-1 p-0 text-center",
        day_button:
          "flex aspect-square w-full items-center justify-center rounded-md font-mono text-sm tabular-nums transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-35",
        today: "[&>button]:ring-1 [&>button]:ring-primary/40",
        outside: "text-muted-foreground/50",
        // showOutsideDays={false}여도 <td>는 렌더된다.
        hidden: "invisible",
        // range_*가 실제 처리를 담당하므로 selected는 중립으로 둔다.
        selected: "",
        range_start:
          "rounded-l-md bg-accent [&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
        range_end:
          "rounded-r-md bg-accent [&>button]:bg-primary [&>button]:font-semibold [&>button]:text-primary-foreground [&>button]:hover:bg-primary",
        range_middle: "bg-accent [&>button]:hover:bg-accent/70",
        ...classNames,
      }}
      components={{
        // 내장 Chevron은 fill 없는 <polygon>이라 스타일시트 없이는 24px 검은 덩어리가 된다.
        Chevron: ({ orientation, className: cls }) =>
          orientation === "left" ? (
            <ChevronLeft className={cls} />
          ) : (
            <ChevronRight className={cls} />
          ),
      }}
      {...props}
    />
  );
}
