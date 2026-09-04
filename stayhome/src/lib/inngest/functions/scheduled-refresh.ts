import { prisma } from "@/lib/prisma";
import { todayKstIso } from "@/lib/utils";
import { AGING_MAX_MS } from "@/lib/freshness";
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

    // 그리고 **아무도 지울 수 없는 유령**을 지운다.
    //
    // `removeVanishedRows`는 사이트가 답한 `(지점, 체크인, 체크아웃)` 그룹 안에서만
    // 지운다. 그 그룹이 **0행으로 답하면**(롯데는 만실을 빈 `roomList`로 준다)
    // 규칙상 손대지 않는다 — 거기서 0행은 "전부 마감"과 "이 지점 조회 실패"를
    // 구별하지 못하고, 후자를 매진으로 발행하는 것이 이 저장소가 가장 피하려는
    // 오류이기 때문이다. 그 규칙은 옳고 바꾸지 않는다. 대가는 그런 그룹의 옛 행이
    // **영원히 남는다**는 것이다.
    //
    // 실측(2026-08-27): 롯데 116행이 **16일째** `available=true`인 채 남아 있었고,
    // 그중 74행이 예약 가능을 주장했다. 리솜은 754행 3.2일. 다섯 곳 전부 60/60
    // 완주한 직후에도 그대로였다 — 완주가 이걸 고치지 못한다는 뜻이다.
    //
    // 7일인 이유: 화면이 신뢰를 거두는 선(`AGING_MAX_MS`, 3일)보다 넉넉히 위다.
    // 3일에 맞춰 지우면 수집이 나흘 빠진 리조트의 재고가 "N일 전 확인"으로 남는
    // 대신 통째로 사라진다 — 낡은 정보와 정보 없음은 다르고, 화면은 이미 그 둘을
    // 구별해 그린다. 7일이면 그 표시가 살아 있을 시간을 다 주고도 유령은 걷힌다.
    const ghosts = await step.run("purge-ghost-inventory", async () => {
      return prisma.$executeRaw`
        DELETE FROM resort_inventory WHERE synced_at < now() - make_interval(days => ${GHOST_MAX_DAYS})
      `;
    });
    if (ghosts > 0) logger.info(`purged ${ghosts} inventory rows nobody re-answered`);

    // 그리고 **제외된 지점의 행**을 지운다.
    //
    // 평상시 이 숫자는 0이어야 한다 — `excludeProperty`가 제외를 만들면서 같은
    // 트랜잭션에서 지우기 때문이다. 0이 아니면 뜻하는 것은 하나다: **크롤이 제외와
    // 경주했다.** `run.ts`는 제외 목록을 패스 시작에 한 번 읽으므로 도중에 생긴
    // 제외는 그 패스의 upsert에 보이지 않고, 그렇게 쓰인 행은 아무도 다시 답하지
    // 않아 `removeVanishedRows`가 **구조적으로 닿을 수 없다**(그 함수는 방금 쓴
    // 행에서 그룹을 뽑는다). 위의 7일 유령 청소가 유일한 다른 그물이다.
    //
    // `run.ts`가 아니라 여기인 이유는 바로 위 두 스텝과 같다 — 크롤 경로에 Neon
    // 왕복을 더하지 않고(패스 하나당 ~200ms), 정리가 실패해도 그날 수집이 안 도는
    // 일이 없도록 팬아웃 **뒤**에 둔다. 게다가 그 경주는 패스 안에서 닫을 수 없다.
    const excludedRows = await step.run("purge-excluded-inventory", async () => {
      return prisma.$executeRaw`
        DELETE FROM resort_inventory i
         USING resort_branch_exclusions x
         WHERE i.resort_id = x.resort_id AND i.branch_name = x.branch_name
      `;
    });
    if (excludedRows > 0) {
      logger.warn(`purged ${excludedRows} inventory rows for excluded branches`);
    }

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

    return { dispatched: slugs.length, slugs, purged, ghosts, excludedRows, reaped };
  },
);

/**
 * 아무도 다시 답해주지 않은 행이 살아 있을 수 있는 최대 일수.
 *
 * `AGING_MAX_MS`(3일)보다 반드시 커야 한다 — 그 아래로 내리면 화면이 "N일 전 확인"으로
 * 보여주려던 행을 스케줄러가 먼저 지워, 낡은 정보가 정보 없음으로 바뀐다.
 * 어긋나면 조용히 틀리는 종류라 모듈 로드에서 던진다(`run.ts`의 예산 검증과 같은 모양).
 */
const GHOST_MAX_DAYS = 7;

if (GHOST_MAX_DAYS * 24 * 60 * 60 * 1000 <= AGING_MAX_MS) {
  throw new Error(
    `ghost purge (${GHOST_MAX_DAYS}일)가 화면의 강등 임계(${AGING_MAX_MS}ms) 이하다 — ` +
      "낡은 행이 화면에 보이기도 전에 지워진다.",
  );
}
