import { crawlResort } from "./crawl-resort";
import { scheduledRefresh } from "./scheduled-refresh";

/** Everything served at /api/inngest. A function missing here never runs. */
export const functions = [scheduledRefresh, crawlResort];

export { crawlResort, scheduledRefresh };
