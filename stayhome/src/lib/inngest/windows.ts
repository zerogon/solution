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
 * 30 days × {1, 2} nights = 60 windows per resort per pass.
 *
 * That count is what the scheduler *asks* for, not what it costs. A crawler
 * whose response covers dates it wasn't asked about stamps each row with its
 * own `stay` (see `InventoryRow`), and `run.ts` then skips every later window
 * those rows already answered — SONO's ~23-day room list turns these 60
 * windows into about 4 requests. Lotte reports no stays and so still pays one
 * request per branch per window, which is what its API offers.
 *
 * This list is therefore deliberately free of per-resort knowledge: it says
 * what the search UI needs kept warm, and each crawler works out how few calls
 * that takes. A resort-specific window list here would be a second opinion
 * about a span only the crawler can actually observe.
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
