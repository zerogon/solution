import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a "YYYY-MM-DD" string to a UTC-midnight Date.
 *
 * Date convention for the whole app: "YYYY-MM-DD" strings are exchanged at the
 * boundaries, and every Date object representing a calendar day is UTC midnight
 * produced by this function. Used on BOTH the crawl write path
 * (`runResortCrawl` → `upsertInventory`) and the inventory read path so the
 * same `@db.Date` value is produced for equality matching. Consumers must read
 * such Dates with UTC getters only (see `crawlers/lotte/search.ts`).
 */
export function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/** Today's calendar date in KST as "YYYY-MM-DD", regardless of server timezone. */
export function todayKstIso(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

/** Return a copy of a UTC-midnight Date shifted by `n` days. */
export function addDaysUtc(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

/**
 * Shift a "YYYY-MM-DD" string by `n` days, staying in string space.
 *
 * Goes through `parseDate`/`addDaysUtc` so the UTC-only rule holds — never build
 * a Date from a local-time API here, or DST/timezone shifts will move the day.
 */
export function addDaysIso(s: string, n: number): string {
  return addDaysUtc(parseDate(s), n).toISOString().slice(0, 10);
}

/** Whole days between two "YYYY-MM-DD" strings (`to - from`). */
export function diffDaysIso(from: string, to: string): number {
  return Math.round(
    (parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000,
  );
}

/** The Sunday that starts the week containing `s`, as "YYYY-MM-DD". */
export function isoWeekStart(s: string): string {
  return addDaysIso(s, -parseDate(s).getUTCDay());
}
