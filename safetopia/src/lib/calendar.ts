import { addDaysIso, parseDate } from "@/lib/utils";

/** "YYYY-MM" → 그 달의 첫날/마지막날 ISO. */
export function monthBounds(ym: string): { first: string; last: string } {
  const first = `${ym}-01`;
  const d = parseDate(first);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return { first, last: `${ym}-${String(lastDay).padStart(2, "0")}` };
}

export function shiftMonth(ym: string, n: number): string {
  const d = parseDate(`${ym}-01`);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  return t.toISOString().slice(0, 7);
}

/**
 * 월 그리드 — 일요일 시작, 6주(42칸) 고정. `inMonth`가 false인 칸은 앞뒤 달의 날짜.
 * 6주 고정인 이유: 달마다 5줄/6줄이 오가면 아래 콘텐츠가 들썩인다.
 */
export function monthGrid(ym: string): { iso: string; inMonth: boolean }[] {
  const { first } = monthBounds(ym);
  const startOffset = parseDate(first).getUTCDay();
  const start = addDaysIso(first, -startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const iso = addDaysIso(start, i);
    return { iso, inMonth: iso.slice(0, 7) === ym };
  });
}

const YM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** searchParams의 `m`을 검증해 "YYYY-MM"으로. 없거나 이상하면 KST 오늘의 달. */
export function resolveMonthParam(raw: string | undefined, todayIso: string): string {
  return raw && YM_RE.test(raw) ? raw : todayIso.slice(0, 7);
}

/**
 * 화면 음영용 "쉬어 보이는 날" — 주말 + 지점 휴무 요일 + 공휴일.
 *
 * `leave-days.ts`의 `dayOff`(연차 차감 판정)와 **일부러 다르다**. 주말 연차는 그대로 차감된다
 * (카페는 주말이 성수기 — AGENTS.md "주말 자동 제외 없음"). 여기 주말이 들어간 건 표에서 주
 * 단위 리듬을 눈으로 잡기 위한 것뿐이고 차감 여부 표시가 아니다. 둘을 "일치시키려" 합치지 말 것.
 *
 * `holiday`는 호출자가 오라클로 이미 판정한 공휴일명(아니면 null) — 커버리지 밖 연도는 null이
 * 되어 음영이 빠지는데, 없는 정보를 지어내지 않는 쪽이 맞다.
 */
export function isShadedDay(iso: string, closedWeekdays: readonly number[], holiday: string | null): boolean {
  const dow = parseDate(iso).getUTCDay();
  return dow === 0 || dow === 6 || closedWeekdays.includes(dow) || holiday != null;
}

/*
 * 음영은 **한 가지 회색**(최종 L≈0.953)인데 클래스가 둘인 이유는 바탕이 다르기 때문이다.
 * 둘 다 문자열 리터럴이어야 한다 — Tailwind는 조합해서 만든 클래스명을 스캔하지 못한다.
 */

/**
 * 표(`LeaveScheduleBoard`)의 `<td>`용. 바탕이 불투명한 카드라 반투명이 예측대로 섞이고,
 * 그래야 행 hover(`hover:bg-muted/50`)와 합계 행(`bg-muted/20`) 틴트가 음영 칸에서도 비쳐 보인다.
 * 여기서 불투명을 쓰면 음영 열에서 hover 피드백이 구멍 난다.
 */
export const SHADED_DAY_CLASS = "bg-muted-foreground/10";

/**
 * `MonthGrid` 칸용 — 반드시 **불투명**이어야 한다.
 * 그리드는 `gap-px bg-border` 컨테이너 위에 칸을 얹고, twMerge가 칸의 `bg-background`를 지우므로
 * 반투명이면 `--border` 위에 섞여 rgb(210,213,214)까지 내려간다. 격자선보다 어둡고 달 밖 칸보다도
 * 진해져 위계가 뒤집힌다(실측 확인). 배경 위에 미리 섞어 표 쪽과 같은 회색을 만든다.
 */
export const SHADED_DAY_CELL = "bg-[color-mix(in_oklab,var(--muted-foreground)_8%,var(--background))]";

/** 달 밖 칸. 같은 이유로 불투명하고, 맥락일 뿐이라 음영보다 **연해야** 한다. */
export const OUT_OF_MONTH_CELL =
  "bg-[color-mix(in_oklab,var(--muted)_60%,var(--background))] text-muted-foreground/50";
