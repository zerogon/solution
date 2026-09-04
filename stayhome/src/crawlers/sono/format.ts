import { parseDate, toIsoDate } from "@/lib/utils";

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

/**
 * The inverse, for the per-row `ciYmd` values the response carries for dates
 * we didn't ask about. Returns null on anything that isn't 8 digits rather
 * than an Invalid Date, so a malformed row is dropped at the parser instead of
 * reaching the upsert as a `NaN`-dated stay.
 *
 * Routed through `parseDate` so these dates land on UTC midnight like every
 * other date in the app — `new Date("2026-08-20")` is already UTC, but going
 * through the shared helper is what keeps that a convention rather than a
 * coincidence.
 */
export function parseDateCompact(s: string): Date | null {
  if (!/^\d{8}$/.test(s)) return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const d = parseDate(iso);
  // Rejects impossible dates (20260231 → 2026-03-03) rather than silently
  // shifting them into the next month.
  return toIsoDate(d) === iso ? d : null;
}
