import { parseDate, toIsoDate } from "@/lib/utils";

/**
 * Format a UTC-midnight Date (produced by `parseDate`) as the compact YYYYMMDD
 * this site uses for `STRT_DATE`/`END_DATE`.
 *
 * A copy of the Lotte / SONO / Resom helpers rather than a shared one, for the
 * reason their headers give: it is six lines, and hoisting it only pays off if
 * every resort agrees on the format.
 */
export function formatDateCompact(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/**
 * The inverse, for `SESN_DATE`. Every row this crawler emits is dated by one of
 * them, so a malformed value must not become a `NaN`-dated stay — and an
 * impossible one must not silently roll forward (20260231 → 2026-03-03) and
 * file a February booking under March.
 */
export function parseDateCompact(s: string): Date | null {
  if (!/^\d{8}$/.test(s)) return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  const d = parseDate(iso);
  return toIsoDate(d) === iso ? d : null;
}
