import type { BrowserContext, Page } from "playwright-core";

export type CrawlerLogger = (msg: string, meta?: Record<string, unknown>) => void;

export interface CrawlerContext {
  resortId: string;
  slug: string;
  context: BrowserContext;
  page: Page;
  credentials: { id: string; pw: string };
  log: CrawlerLogger;
}

export interface SearchParams {
  /** UTC-midnight check-in date (produced by `parseDate`); read with UTC getters */
  checkin: Date;
  /** UTC-midnight check-out date, same convention as `checkin` */
  checkout: Date;
  /** optional branch filter — matches `ResortInventory.branchName` (applied per-resort) */
  branch?: string;
}

export interface InventoryRow {
  branchName: string;
  roomType: string;
  region: string;
  available: boolean;
  closingSoon: boolean;
  detailUrl?: string;
  /**
   * The stay this row describes, when it is not the one that was requested.
   *
   * Some sites answer a single date with a span around it — SONO's room list
   * returns ~23 days regardless of `ciYmd`, because the SPA uses it to paint
   * its date picker. A crawler that can attribute those extra dates correctly
   * reports them here and `run.ts` files each row under its own stay instead
   * of under the requested window; the scheduler then skips every later window
   * the rows already covered (see the window loop in `run.ts`).
   *
   * Omit it when the rows only describe the requested window — the Lotte
   * crawler does, and gets the original behaviour unchanged.
   *
   * Both dates or neither: a lone `checkin` would silently inherit the
   * requested checkout and quietly claim a stay length nobody measured.
   */
  stay?: { checkin: Date; checkout: Date };
}

export interface CrawlerModule {
  slug: string;
  displayName: string;
  defaultRegion: string;

  /** Quick check: is the current storageState still authenticated? */
  validateSession(ctx: CrawlerContext): Promise<boolean>;

  /** Run the login form. Caller is responsible for persisting storageState after. */
  login(ctx: CrawlerContext): Promise<void>;

  /** Run a search pass and return normalized inventory rows. */
  searchAvailability(ctx: CrawlerContext, params: SearchParams): Promise<InventoryRow[]>;
}
