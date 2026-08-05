import { addDaysIso, todayKstIso } from "@/lib/utils";
import type { CrawlWindow } from "./client";

/**
 * The "hot window" the scheduler keeps warm in `resort_inventory`.
 *
 * `/api/inventory` matches (checkinDate, checkoutDate) exactly, and the search
 * UI allows any check-in with 1-14 nights — that full cross-product is far too
 * large to pre-collect (14 nights × 60 days × 4 branches ≈ 3,400 API calls per
 * pass). So the cron fills only the combinations that actually get asked for,
 * and anything outside it falls back to the manual refresh path
 * (`POST /api/resorts/[slug]/refresh`, which crawls the requested window live).
 *
 * 30 days × {1, 2} nights × 4 branches = 240 calls per pass.
 */
export const HOT_WINDOW_DAYS = 30;
export const HOT_WINDOW_NIGHTS = [1, 2] as const;

/**
 * Build the hot window, nearest date first.
 *
 * Ordering is load-bearing: a pass that runs out of budget stops partway
 * through this list, so the dates most likely to be queried must come first.
 * Within a day, the shorter stay leads for the same reason.
 */
export function buildHotWindows(
  startIso: string = todayKstIso(),
  days: number = HOT_WINDOW_DAYS,
  nights: readonly number[] = HOT_WINDOW_NIGHTS,
): CrawlWindow[] {
  const out: CrawlWindow[] = [];
  for (let d = 0; d < days; d++) {
    const checkin = addDaysIso(startIso, d);
    for (const n of nights) {
      out.push({ checkin, checkout: addDaysIso(checkin, n) });
    }
  }
  return out;
}
