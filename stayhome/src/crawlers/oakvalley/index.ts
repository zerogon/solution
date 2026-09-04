import type { CrawlerContext, CrawlerModule, SearchParams } from "../types";
import { OAKVALLEY } from "./config";
import { checkLoggedIn, performLogin } from "./login";
import { performSearch } from "./search";

export const oakvalleyCrawler: CrawlerModule = {
  slug: "oakvalley",
  /** Must match the seeded `Resort.name` so admin screens and crawl logs agree. */
  displayName: "오크밸리",
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

export { OAKVALLEY };
