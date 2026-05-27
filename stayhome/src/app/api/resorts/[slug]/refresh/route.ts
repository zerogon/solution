import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { AuditAction, ResortSlug } from "@/generated/prisma/enums";
import { runResortCrawl } from "@/crawlers/run";
import { isCrawlerRegistered } from "@/crawlers/registry";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const VALID_SLUGS = Object.values(ResortSlug) as ResortSlug[];

function toSlug(raw: string): ResortSlug | null {
  const upper = raw.toUpperCase();
  return VALID_SLUGS.find((s) => s === upper) ?? null;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await requireSession();
  const { slug: rawSlug } = await params;
  const slug = toSlug(rawSlug);
  if (!slug) {
    return NextResponse.json({ error: "unknown_slug" }, { status: 400 });
  }
  if (!isCrawlerRegistered(slug)) {
    return NextResponse.json(
      { error: "crawler_not_implemented", slug },
      { status: 501 },
    );
  }

  await writeAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: AuditAction.MANUAL_REFRESH,
    metadata: { slug },
  });

  try {
    const result = await runResortCrawl(slug, { triggeredBy: "MANUAL" });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "crawl_failed", message: msg }, { status: 500 });
  }
}
