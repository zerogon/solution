import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a "YYYY-MM-DD" string to a UTC-midnight Date.
 *
 * Used on BOTH the crawl write path (`runResortCrawl` → `upsertInventory`) and
 * the inventory read path so the same `@db.Date` value is produced for equality
 * matching. UTC midnight is timezone-stable: on KST (UTC+9) and UTC servers the
 * calendar-click logic in `crawlers/lotte/search.ts` (which reads
 * getFullYear/getMonth/getDate) still resolves to the intended day.
 */
export function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}
