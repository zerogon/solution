/**
 * Format a UTC-midnight Date (produced by `parseDate`) for the reservation
 * API, which expects compact YYYYMMDD.
 */
export function formatDateCompact(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}
