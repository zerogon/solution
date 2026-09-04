import { parseDate, toIsoDate } from "@/lib/utils";

/**
 * Format a UTC-midnight Date (produced by `parseDate`) as the compact YYYYMMDD
 * the reservation API expects in `ciYmd`/`coYmd`.
 *
 * A copy of the Lotte and SONO helpers rather than a shared one, for the same
 * reason: it is six lines, and hoisting it to `_shared` only pays off if every
 * resort agrees on the format — the moment one wants YYYY-MM-DD, `_shared`
 * grows two functions plus a per-crawler choice.
 */
export function formatDateCompact(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * The inverse, for the calendar keys — every row this crawler emits is dated
 * by one of them, so a malformed key must not become a `NaN`-dated stay.
 * Returns null rather than an Invalid Date so the parser can drop it.
 */
export function parseDateCompact(s: string): Date | null {
  if (!/^\d{8}$/.test(s)) return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const d = parseDate(iso);
  // Rejects impossible dates (20260231 → 2026-03-03) rather than silently
  // shifting them into the next month.
  return toIsoDate(d) === iso ? d : null;
}
