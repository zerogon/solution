import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { writeAudit } from "@/lib/audit";
import { AuditAction, ResortSlug } from "@/generated/prisma/enums";
import { runResortCrawl } from "@/crawlers/run";
import { isCrawlerRegistered } from "@/crawlers/registry";
import { searchParamsSchema } from "@/lib/validators";
import { parseDate } from "@/lib/utils";
import type { SearchParams } from "@/crawlers/types";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const VALID_SLUGS = Object.values(ResortSlug) as ResortSlug[];

function toSlug(raw: string): ResortSlug | null {
  const upper = raw.toUpperCase();
  return VALID_SLUGS.find((s) => s === upper) ?? null;
}

export async function POST(
  req: Request,
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

  // Optional JSON body { checkin, checkout, region } narrows the crawl to a
  // user-specified window/branch. Absent body → defaultSearch() (today+7, all
  // branches), preserving the admin RefreshButton behavior.
  let search: SearchParams | undefined;
  const raw = await req.json().catch(() => null);
  if (raw != null) {
    const parsed = searchParamsSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_search", issues: parsed.error.flatten() },
        { status: 400 },
      );
    }
    search = {
      checkin: parseDate(parsed.data.checkin),
      checkout: parseDate(parsed.data.checkout),
      region: parsed.data.region,
    };
  }

  await writeAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: AuditAction.MANUAL_REFRESH,
    metadata: { slug, ...(search ? { search: raw } : {}) },
  });

  try {
    const result = await runResortCrawl(slug, { triggeredBy: "MANUAL", search });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "crawl_failed", message: msg }, { status: 500 });
  }
}
