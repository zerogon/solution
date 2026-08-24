import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { CrawlStatus } from "@/generated/prisma/enums";
import { inngest } from "@/lib/inngest/client";
import {
  SCHEDULED_CRAWL_PAUSE_REASON,
  SCHEDULED_CRAWL_PAUSED,
} from "@/lib/inngest/pause";
import { listCrawlableResorts } from "@/lib/inngest/targets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Once-a-day backstop for the Inngest scheduler (`scheduled-refresh`), wired in
 * vercel.json. Inngest only fires crons for an app it has successfully synced,
 * so a failed sync would silently stop all collection; this path re-dispatches
 * the same events straight from Vercel's own scheduler.
 *
 * Inngest가 09:00 KST에 돌고 이 백스톱은 12:00 KST에 돈다. 정기 수집이 하루 1회로
 * 바뀌었으므로(운영자 결정, 2026-08-24) 백스톱이 무조건 팬아웃하면 그 결정이 무효가
 * 된다 — 그래서 **이미 최근에 성공한 리조트는 건너뛴다**. 즉 평상시 이 경로는
 * 아무것도 하지 않고, Inngest가 실제로 죽은 날에만 일을 한다.
 *
 * 건너뛴 것을 응답에 실어 보내는 게 중요하다. 조용한 no-op은 "할 일이 없었다"와
 * "이 라우트도 같이 죽었다"를 구별해주지 않고, 이 프로젝트는 정확히 그 구별이
 * 안 되는 상태로 오래 고생했다 (CLAUDE.md "배포" 절).
 *
 * Bypasses session auth (`auth.config.ts` isPublic) and is therefore guarded by
 * `CRON_SECRET` instead: Vercel Cron sends it as `Authorization: Bearer …` when
 * the env var is set. Unset in an environment where this route is reachable
 * means anyone can trigger a crawl, so it's a hard requirement, not a fallback.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron_secret_unset" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Same switch as `scheduled-refresh`. Checked after the secret, not before:
  // an unauthenticated caller should learn nothing about our schedule, paused
  // or not.
  if (SCHEDULED_CRAWL_PAUSED) {
    return NextResponse.json({
      dispatched: 0,
      paused: true,
      reason: SCHEDULED_CRAWL_PAUSE_REASON,
    });
  }

  const slugs = await listCrawlableResorts();

  // Inngest의 09:00 실행이 성공했다면 그 리조트는 이미 오늘 치를 채웠다.
  // 창을 6시간으로 잡은 이유: 09:00 실행이 늦어지거나 재시도로 밀려도 12:00 백스톱이
  // 그것을 "없었던 일"로 읽지 않을 만큼 넓고, 어제 것을 오늘로 착각할 만큼 넓지는 않다.
  const since = new Date(Date.now() - RECENT_SUCCESS_MS);
  const recent = await prisma.crawlLog.findMany({
    where: { status: CrawlStatus.SUCCESS, startedAt: { gte: since } },
    select: { resort: { select: { slug: true } } },
    distinct: ["resortId"],
  });
  const fresh = new Set(recent.map((r) => r.resort.slug as string));

  const dispatch = slugs.filter((slug) => !fresh.has(slug));
  const skipped = slugs.filter((slug) => fresh.has(slug));

  if (dispatch.length > 0) {
    await inngest.send(
      dispatch.map((slug) => ({
        name: "resort/crawl.requested" as const,
        data: { slug, triggeredBy: "CRON_BACKSTOP" },
      })),
    );
  }

  return NextResponse.json({
    dispatched: dispatch.length,
    slugs: dispatch,
    // 빈 배열이라도 항상 싣는다 — 이 필드의 존재 자체가 "라우트는 살아 있고 판단을
    // 내렸다"는 증거이고, 그게 이 백스톱이 답해야 할 질문이다.
    skipped,
    recentSuccessWithinHours: RECENT_SUCCESS_MS / 3_600_000,
  });
}

/** 이보다 최근에 성공한 리조트는 백스톱이 다시 돌리지 않는다. */
const RECENT_SUCCESS_MS = 6 * 60 * 60 * 1000;
