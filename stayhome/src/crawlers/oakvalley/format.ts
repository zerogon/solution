/**
 * Date helpers for the OAKVALLEY calendar.
 *
 * A copy rather than a hoist, for the reason `resom/format.ts` gives: each
 * site's date quirks are the crawler's own, and a shared module would have to
 * keep all of them alive at once. What is specific here is that the response
 * identifies a day by its **day-of-month alone** — the year and month live in
 * the request — so the conversion back is a place a bug can hide silently.
 */

/** `{year, month}` (month is 1-based) of a UTC-midnight Date. */
export function monthKey(d: Date): { year: number; month: number } {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** `2026, 9` → `"2026-09"`. The key a fetched month is cached and scoped under. */
export function monthScopeKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** The month after `{year, month}`, 1-based. */
export function nextMonth(year: number, month: number): { year: number; month: number } {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/**
 * `CD_DATE` (a day-of-month) under a known scope → a UTC-midnight Date.
 *
 * Returns null for a day the month does not have. Deliberately **not** a
 * rollover: `new Date(Date.UTC(2026, 8, 31))` silently becomes 2026-10-01, and
 * that would file one month's availability under the next one — a wrong row,
 * which is worse than a missing one.
 */
export function dayOfMonthToDate(
  year: number,
  month: number,
  cdDate: string | number | undefined,
): Date | null {
  const day = Number(cdDate);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

/**
 * The months one pass must fetch to answer check-ins starting at `from`.
 *
 * `count` months starting with `from`'s own. Two is the configured value and
 * the reason is the month tail: a response stops at month end, so a stay that
 * starts on the last day of a month has no second night to check without the
 * month after it.
 */
export function monthsCovering(
  from: Date,
  count: number,
): Array<{ year: number; month: number }> {
  const out: Array<{ year: number; month: number }> = [];
  let cur = monthKey(from);
  for (let i = 0; i < count; i++) {
    out.push(cur);
    cur = nextMonth(cur.year, cur.month);
  }
  return out;
}
