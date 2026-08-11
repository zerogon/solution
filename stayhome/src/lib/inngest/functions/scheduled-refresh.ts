import { inngest } from "../client";
import { SCHEDULED_CRAWL_PAUSE_REASON, SCHEDULED_CRAWL_PAUSED } from "../pause";
import { listCrawlableResorts } from "../targets";

/**
 * The actual scheduler.
 *
 * Not a Vercel Cron: Hobby projects are capped at *one invocation per day* and
 * a sub-daily cron expression fails at deploy time
 * (https://vercel.com/docs/cron-jobs/usage-and-pricing). Inngest does its own
 * scheduling and calls /api/inngest, so the cadence is unconstrained by the
 * hosting plan. `/api/cron/refresh` + vercel.json remain as a once-a-day
 * backstop for when the Inngest app is out of sync.
 *
 * Every 3 hours, on the hour, KST — 8 refreshes a day. Deliberately not 6h:
 * that matches ResortSession's TTL exactly, so every run would land on an
 * expired session and pay for a fresh login.
 */
export const scheduledRefresh = inngest.createFunction(
  { id: "scheduled-refresh", name: "정기 재고 갱신" },
  { cron: "TZ=Asia/Seoul 0 */3 * * *" },
  async ({ step, logger }) => {
    // Checked before anything else, and before any step: a paused run must cost
    // nothing and must say so. See `../pause.ts` for why the cron trigger is
    // still registered rather than removed.
    if (SCHEDULED_CRAWL_PAUSED) {
      logger.warn(`scheduled crawling is PAUSED — ${SCHEDULED_CRAWL_PAUSE_REASON}`);
      return { dispatched: 0, paused: true, reason: SCHEDULED_CRAWL_PAUSE_REASON };
    }

    const slugs = await step.run("list-resorts", listCrawlableResorts);
    if (slugs.length === 0) {
      logger.warn("no crawlable resorts, nothing scheduled");
      return { dispatched: 0 };
    }

    // Fan out one event per resort so each gets its own retries, concurrency
    // slot and CrawlLog trail — one resort's site being down must not stop the
    // others (PRD 6.2 "실패 리조트 자동 제외").
    await step.sendEvent(
      "fan-out",
      slugs.map((slug) => ({
        name: "resort/crawl.requested" as const,
        data: { slug, triggeredBy: "CRON" },
      })),
    );

    return { dispatched: slugs.length, slugs };
  },
);
