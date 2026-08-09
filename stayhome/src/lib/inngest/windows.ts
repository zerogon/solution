import { addDaysIso, todayKstIso } from "@/lib/utils";
import type { CrawlWindow } from "./client";

/**
 * The "hot window" the scheduler keeps warm in `resort_inventory`.
 *
 * `/api/inventory` matches (checkinDate, checkoutDate) exactly, and the search
 * UI allows any check-in with 1-14 nights — that full cross-product is far too
 * large to pre-collect. So the cron fills only the combinations that actually
 * get asked for, and anything outside it falls back to the manual refresh path
 * (`POST /api/resorts/[slug]/refresh`, which crawls the requested window live).
 *
 * 30 days × {1, 2} nights = 60 windows per resort per pass. What a window
 * costs is per-resort, not a constant: Lotte is one API call per branch
 * (4 calls), SONO batches all 32 stores into 4 (~7s total).
 *
 * Worth knowing before this is tuned for SONO: its room-list response already
 * carries ~23 days around the requested date (see `crawlers/sono/config.ts`),
 * which `parse.ts` currently discards because `run.ts` files every returned
 * row under the one window it asked for. Letting a crawler report rows for
 * dates it wasn't asked about would collapse SONO's 60 windows into ~3.
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
