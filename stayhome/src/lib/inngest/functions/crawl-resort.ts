import { NonRetriableError } from "inngest";
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
    // already rate-limits logins. Subsumed by the global limit today, but it is
    // here for its own reason — if the global one is ever raised again, this
    // must not have quietly disappeared with it.
    //
    // Global 1: the fan-out sends all five resorts at once and Vercel is free
    // to land them on a single instance, which has one 525MB `/tmp` with a
    // browser living in it. **두 벌은 그 안에 들어가지 않는다** — 이 저장소의
    // 자체 실측이 "한화 크롤 한 번이 끝나면 17MB가 남는다"이다.
    //
    // 2026-08-25에 전역 제한이 없어 다섯이 부딪혔고(`spawn ETXTBSY` 셋 +
    // `ERR_INSUFFICIENT_RESOURCES` 둘), 그때 2를 골랐다. 근거는 "재시도 백오프
    // 중인 리조트가 나머지 넷의 머리를 막으면 안 된다"였다. 08-26 실행이 그
    // 근거를 반증했다 — ETXTBSY는 사라졌지만 한화가 다시 5건 실패했고, **중간
    // 실패 둘은 모두 다른 크롤과 슬롯을 나눠 쓰던 구간**에서 났으며 혼자 쓴
    // 구간은 3연속 성공이었다. 그리고 한화가 09:05~09:08을 혼자 쓴 그 시각에는
    // 나머지 넷이 이미 끝나 있었다 — 막을 머리가 애초에 없었다.
    //
    // 08-26에는 두 번째 근거가 있었다 — "1이 청소 기구를 살려낸다":
    // `sweepStaleProfiles`는 `/proc`을 물어 살아 있는 프로필을 올바르게 건너뛰므로
    // 동시 크롤이 있는 한 회수할 것이 구조적으로 0이라는 것이었다.
    // **그 근거는 이제 약해졌고, 그렇다고 적어 둔다.** 2026-08-27 이후
    // `reapOrphanBrowsers`는 프로세스 **나이**로 판정한다(90초 > `maxDuration` 60초).
    // 그 판정은 동시 크롤이 있어도 옳으므로 청소는 더 이상 직렬화를 요구하지 않는다.
    //
    // 남은 근거는 위의 산술 하나뿐이고, 그것 하나로 충분하다. 청소는 **잔해**를
    // 회수하지 살아 있는 브라우저를 줄여주지 않는다.
    //
    // 대가는 하루 1회 배치의 벽시계뿐이다. 2026-08-27 실측 ~11분이었고,
    // 지점 호출 병렬화(한화·롯데)로 패스가 줄어 ~5분대가 기대된다.
    // 신선도 임계가 26시간이므로 그건 대가가 아니다(`src/lib/freshness.ts`).
    //
    // ⚠️ Inngest는 이 배열을 **최대 2칸**까지만 받는다(`inngest/types.js`의
    // `.max(2)`). 세 번째 제약(예: 무거운 리조트 전용 레인)은 불가능하고,
    // 넣어도 sync가 warn만 하고 조용히 무시할 수 있다.
    concurrency: [
      { limit: 1, key: "event.data.slug" },
      { limit: 1 },
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
          const detail = `${slug} pass ${pass} failed at ${res.errorStage}: ${res.errorMessage}`;
          // 예외: `/tmp` 고갈은 재시도의 대상이 아니다. 재시도는 **같은 워밍
          // 인스턴스**로 돌아가고(Inngest는 인스턴스 어피니티를 제어할 수단을 주지
          // 않는다) 거기서 브라우저를 한 번 더 띄우려 하다 더 마른 디스크를 만든다.
          // 게다가 전역 동시성이 1이라 그 재시도가 **유일한 레인을 붙잡는다** —
          // 2026-08-27 09:05~09:07에 한화의 실패가 2분간 레인을 쥐고 있는 동안
          // 소노와 리솜은 큐에서 기다리다 그날 수집을 통째로 잃었다.
          //
          // 그리고 이 시점의 고갈은 이미 회수할 것을 다 회수한 뒤의 고갈이다
          // (`launchBrowser`가 `reclaimTmp` **다음에** 잰다). 이 프로세스 안에서
          // 더 해볼 것이 남아 있지 않다는 뜻이므로, 세 번 죽는 대신 한 번 죽는다.
          throw res.errorCode === "TMP_EXHAUSTED"
            ? new NonRetriableError(detail)
            : new Error(detail);
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
