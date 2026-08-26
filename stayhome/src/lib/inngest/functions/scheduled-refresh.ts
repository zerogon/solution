import { prisma } from "@/lib/prisma";
import { todayKstIso } from "@/lib/utils";
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
 * **매일 09:00 KST 1회** (운영자 결정, 2026-08-24). 종전은 3시간마다 8회였다.
 *
 * 이 주기의 대가를 분명히 해 둘 것: 간격이 `ResortSession`의 TTL(6시간)보다 길어서
 * **매 실행이 5곳 모두 콜드 로그인**이다. 3시간 주기는 로그인 1회로 실행 2회를 덮었고
 * 그게 "6시간은 금지" 규칙의 근거였는데, 하루 1회에서는 그 규칙이 적용될 여지가 없다 —
 * 어차피 항상 만료된 세션으로 시작한다.
 *
 * 그래서 로그인 실패의 값이 비싸졌다. 롯데 로그인은 간헐적이고(사이트 앞에 넷퍼넬과
 * Imperva가 있다 — AGENTS.md 참조) 하루에 기회가 한 번뿐이라, 놓치면 그 리조트는
 * 24시간짜리 낡음이 된다. 그 낡음은 조회 화면에서 "확인 필요"로 드러난다
 * (`src/lib/freshness.ts`의 임계값이 이 cron과 한 쌍이다 — 주기를 바꾸면 거기도 바꿀 것).
 */
export const scheduledRefresh = inngest.createFunction(
  { id: "scheduled-refresh", name: "정기 재고 갱신" },
  { cron: "TZ=Asia/Seoul 0 9 * * *" },
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

    // 예약할 수 없는 날짜의 행은 조회에 걸릴 일이 없지만 테이블에 계속 쌓인다
    // (2026-08-24 기준 11,733행, 그중 5,008행이 `available=true`인 채로).
    // 팬아웃 **뒤에** 두는 이유: 수집이 이 정리 때문에 늦어지거나, 정리가 실패해서
    // 그날 수집이 통째로 안 도는 일이 없어야 한다.
    const purged = await step.run("purge-past-inventory", async () => {
      const today = todayKstIso();
      return prisma.$executeRaw`
        DELETE FROM resort_inventory WHERE checkin_date < ${today}::date
      `;
    });
    if (purged > 0) logger.info(`purged ${purged} inventory rows for past dates`);

    // 응답 없이 죽은 인보케이션이 남긴 로그를 닫는다.
    //
    // `runResortCrawl`은 `crawl_logs` 행을 RUNNING으로 열고 마지막에 닫는데,
    // Vercel이 `maxDuration`(60초)에 인보케이션을 죽이면 **`finally`조차 돌지
    // 않는다** — 그 행은 영원히 RUNNING으로 남아, 실패했다는 사실도 실패했다는
    // 사실조차 남기지 못한다. 예방은 `run.ts`의 예산 산술이고, 이건 그것이
    // 원리적으로 못 막는 나머지를 치우는 자리다.
    //
    // 여기에 두는 이유 둘: 크롤 경로에 Neon 왕복을 한 번도 더하지 않는다(패스
    // 하나당 ~200ms × 하루 12회), 그리고 정리가 실패해도 그날 수집이 안 도는
    // 일이 없도록 팬아웃 **뒤**라는 기존 판단을 그대로 따른다.
    //
    // 컷오프가 1시간인 이유: 이 스텝이 도는 순간 방금 팬아웃한 크롤들이 **실제로
    // RUNNING**이다. 5분 같은 값은 살아 있는 런을 실패로 표시한다. 한 패스는
    // 60초를 넘을 수 없으므로 1시간은 "확실히 죽었다" 쪽에 한참 여유가 있다.
    const reaped = await step.run("reap-orphaned-logs", async () => {
      return prisma.$executeRaw`
        UPDATE crawl_logs
           SET status = 'FAILED',
               finished_at = now(),
               error_message = coalesce(error_message, '')
                 || '[killed] 인보케이션이 로그를 닫지 못했다 (maxDuration 초과 추정)'
         WHERE status = 'RUNNING'
           AND started_at < now() - interval '1 hour'
      `;
    });
    if (reaped > 0) logger.warn(`reaped ${reaped} crawl_logs rows stuck at RUNNING`);

    return { dispatched: slugs.length, slugs, purged, reaped };
  },
);
