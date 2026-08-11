import { NextResponse } from "next/server";
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
  if (slugs.length > 0) {
    await inngest.send(
      slugs.map((slug) => ({
        name: "resort/crawl.requested" as const,
        data: { slug, triggeredBy: "CRON_BACKSTOP" },
      })),
    );
  }

  return NextResponse.json({ dispatched: slugs.length, slugs });
}
