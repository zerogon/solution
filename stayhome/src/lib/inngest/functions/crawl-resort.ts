import { runResortCrawl } from "@/crawlers/run";
import { CrawlStatus } from "@/generated/prisma/enums";
import { parseDate } from "@/lib/utils";
import { notifySlack } from "@/lib/slack";
import { inngest, type CrawlWindow } from "../client";
import { buildHotWindows } from "../windows";

/**
 * Upper bound on passes per crawl. 60 hot windows at the ~5 windows a 50s pass
 * fits comfortably needs ~12; the cap only exists so a pathologically slow site
 * can't spin here forever. Hitting it is logged, not silently ignored.
 */
const MAX_PASSES = 24;

export const crawlResort = inngest.createFunction(
  {
    id: "crawl-resort",
    name: "리조트 재고 수집",
    // Two limits, and they answer different questions.
    //
    // Per-slug 1: two concurrent passes for one resort would race on the shared
    // ResortSession storageState row and double the login load on a site that
    // already rate-limits logins.
    //
    // Global 2: the fan-out sends all five resorts at once, and Vercel is free
    // to land them on a single instance. That instance has one 525MB `/tmp`,
    // and a browser lives in it. On 2026-08-25 the five collided twice over:
    // three of them got `spawn ETXTBSY` racing to inflate the same
    // `/tmp/chromium`, and HANWHA — the heaviest and longest-running — later
    // died on `ERR_INSUFFICIENT_RESOURCES` with nothing left to reclaim
    // (`sweepStaleProfiles` correctly refuses to delete a live crawl's
    // profile, so concurrency pressure is not something cleanup can fix).
    //
    // 2 rather than 1: a resort waiting out a retry backoff should not hold the
    // head of the line — HANWHA spent 09:05–09:08 alone doing exactly that. The
    // cost is wall-clock on a once-a-day batch, which is not a cost.
    concurrency: [
      { limit: 1, key: "event.data.slug" },
      { limit: 2 },
    ],
    retries: 2,
    onFailure: async ({ event, error }) => {
      const slug = event.data.event.data.slug;
      await notifySlack(
        `:rotating_light: *${slug}* 재고 수집 실패\n${error.message}`,
      );
    },
  },
  { event: "resort/crawl.requested" },
  async ({ event, step, runId, logger }) => {
    const { slug, forceLogin, triggeredBy = "CRON" } = event.data;
    const requested: CrawlWindow[] = event.data.windows ?? buildHotWindows();

    let pending = requested;
    let rowsUpserted = 0;
    let pass = 0;
    let stalledPasses = 0;

    // Each pass is one browser session covering as many windows as its wall
    // clock allows; what it couldn't reach carries into the next pass. Passes
    // are separate step.run invocations precisely so each one gets a fresh
    // 60s Vercel function budget — that is how the 60s cap is worked around.
    while (pending.length > 0 && pass < MAX_PASSES) {
      const batch = pending;
      const result = await step.run(`crawl-pass-${pass}`, async () => {
        const res = await runResortCrawl(slug, {
          triggeredBy,
          inngestRunId: runId,
          // Only the first pass honors forceLogin; later passes should reuse
          // the session the first one just established.
          forceLogin: pass === 0 ? forceLogin : false,
          windows: batch.map((w) => ({
            checkin: parseDate(w.checkin),
            checkout: parseDate(w.checkout),
          })),
        });
        if (res.status !== CrawlStatus.SUCCESS) {
          // Throw so Inngest retries this pass. runResortCrawl swallows its own
          // errors into a FAILED result (it has a CrawlLog row to close first),
          // so without this the step would look successful.
          throw new Error(
            `${slug} pass ${pass} failed at ${res.errorStage}: ${res.errorMessage}`,
          );
        }
        return res;
      });

      rowsUpserted += result.rowsUpserted;
      pending = pending.slice(result.windowsCompleted);
      // `pass` doubles as the step id, so it must advance on every iteration —
      // reusing an id would collide with the memoized step from this run.
      pass++;

      if (result.windowsCompleted === 0) {
        // Zero progress is expected once: a pass that had to log in can burn
        // its whole budget before reaching a window, and the next pass will
        // find the session cached. Twice in a row means no single window fits
        // the budget at all, and looping would never converge.
        if (++stalledPasses >= 2) {
          logger.error("two passes made no progress, aborting", { slug, pass });
          break;
        }
      } else {
        stalledPasses = 0;
      }
    }

    if (pending.length > 0) {
      await step.run("notify-incomplete", () =>
        notifySlack(
          `:warning: *${slug}* 수집이 ${pass}패스 후에도 ${pending.length}/${requested.length} 윈도우를 남겼습니다.`,
        ),
      );
    }

    return {
      slug,
      passes: pass,
      rowsUpserted,
      windowsCompleted: requested.length - pending.length,
      windowsRequested: requested.length,
    };
  },
);
