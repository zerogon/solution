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
    // One crawl per resort at a time. Two concurrent passes would race on the
    // shared ResortSession storageState row and double the login load on a
    // site that already rate-limits logins.
    concurrency: { limit: 1, key: "event.data.slug" },
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
