import type { CrawlerContext, CrawlerModule, SearchParams } from "../types";
import { KENSINGTON } from "./config";
import { checkLoggedIn, performLogin } from "./login";
import { performSearch } from "./search";

export const kensingtonCrawler: CrawlerModule = {
  slug: "kensington",
  // Matches the `Resort.name` seeded for this slug, so the admin screens and
  // the crawl logs read the same way.
  displayName: "켄싱턴리조트",
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

export { KENSINGTON };
