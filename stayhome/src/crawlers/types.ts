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
  /** local-time check-in date (KST midnight) */
  checkin: Date;
  checkout: Date;
  /** optional region label to narrow the search (applied per-resort) */
  region?: string;
}

export interface InventoryRow {
  branchName: string;
  roomType: string;
  region: string;
  available: boolean;
  closingSoon: boolean;
  detailUrl?: string;
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
