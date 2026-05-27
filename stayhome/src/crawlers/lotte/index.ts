import type { CrawlerContext, CrawlerModule, SearchParams } from "../types";
import { LOTTE } from "./config";
import { checkLoggedIn, performLogin } from "./login";
import { performSearch } from "./search";

export const lotteCrawler: CrawlerModule = {
  slug: "lotte",
  displayName: "롯데리조트",
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

export { LOTTE };
