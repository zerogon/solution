/**
 * Format a UTC-midnight Date (produced by `parseDate`) for the reservation
 * API, which expects compact YYYYMMDD in both `ciYmd`/`coYmd` and the
 * per-row `ciYmd` we match against.
 *
 * A copy of the Lotte helper rather than a shared one: it is six lines, and
 * hoisting it to `_shared` only pays off if every resort agrees on the format
 * — the moment one wants YYYY-MM-DD, `_shared` grows two functions plus a
 * per-crawler choice, which is more machinery than the duplication costs.
 */
export function formatDateCompact(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
