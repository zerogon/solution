import { EventSchemas, Inngest } from "inngest";
import type { ResortSlug } from "@/generated/prisma/enums";

/**
 * A crawl window as it crosses the Inngest boundary: plain "YYYY-MM-DD"
 * strings, never Dates. Event payloads and step results are JSON, so a Date
 * would come back as a full ISO timestamp string and quietly stop being a Date
 * — convert at the edge with `parseDate`/`toIsoDate` instead.
 */
export interface CrawlWindow {
  checkin: string;
  checkout: string;
}

type Events = {
  "resort/crawl.requested": {
    data: {
      slug: ResortSlug;
      /** Windows to fill. Omitted → the hot window from today (KST). */
      windows?: CrawlWindow[];
      /** Skip the cached storageState and log in fresh. */
      forceLogin?: boolean;
      /** Recorded on CrawlLog.triggeredBy. */
      triggeredBy?: string;
    };
  };
};

/**
 * `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` are read from the environment by
 * the SDK itself; there is nothing to pass here. Locally, `npx inngest-cli dev`
 * needs neither.
 */
export const inngest = new Inngest({
  id: "stayhome",
  schemas: new EventSchemas().fromRecord<Events>(),
});
