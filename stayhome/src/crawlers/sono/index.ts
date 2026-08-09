import type { CrawlerContext, CrawlerModule, SearchParams } from "../types";
import { SONO } from "./config";
import { checkLoggedIn, performLogin } from "./login";
import { performSearch } from "./search";

export const sonoCrawler: CrawlerModule = {
  slug: "sono",
  // Matches the `Resort.name` seeded for this slug, so the admin screens and
  // the crawl logs read the same way.
  displayName: "소노호텔앤리조트",
  defaultRegion: "전국",

  validateSession(ctx: CrawlerContext) {
    return checkLoggedIn(ctx);
  },

  login(ctx: CrawlerContext) {
    return performLogin(ctx);
  },

  searchAvailability(ctx: CrawlerContext, params: SearchParams) {
    return performSearch(ctx, params);
  },
};

export { SONO };
