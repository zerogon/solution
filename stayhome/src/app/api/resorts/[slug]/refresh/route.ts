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

  // Optional JSON body { checkin, checkout, branch } narrows the crawl to a
  // user-specified window/branch. Absent body → defaultSearch() (today KST,
  // one night, all branches), preserving the admin RefreshButton behavior.
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
      branch: parsed.data.branch,
      // 요금은 "사람이 지점 하나를 지목해 누르고 결과를 기다리는" 경우에만 붙인다.
      // 그 조건과 `branch`의 유무가 같은 값에서 나온다 — 조회 화면의 최신화는
      // 구조적으로 항상 단일 지점이고(`refreshTarget`), 관리 화면 버튼은 본문 없이,
      // 스케줄러는 날짜만 보낸다. 클라이언트가 정하게 두지 않는 이유는 그러면
      // "전 지점 + 요금"이라는, 예산에 들어가지 않는 요청을 만들 수 있기 때문이다.
      withPrices: parsed.data.branch != null,
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
