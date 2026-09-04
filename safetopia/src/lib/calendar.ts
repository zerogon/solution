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
