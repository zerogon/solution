import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { inventoryQuerySchema } from "@/lib/validators";
import { parseDate } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cached inventory read for the user search screen. Returns rows previously
 * collected by a crawl (`runResortCrawl` → upsertInventory) for the given
 * check-in/check-out window, optionally narrowed to one resort.
 *
 * `resort` is the only narrowing the client asks for; region/property filtering
 * happens client-side so the filter chips can show per-axis availability counts
 * without a round trip each. `branch` (= `ResortInventory.branchName`) is still
 * accepted for compatibility with service-worker-cached URLs.
 *
 * Dates are parsed with the same `parseDate` helper used on the write path so
 * `@db.Date` equality matching holds.
 *
 * Row order matters to the UI: region → resort → branch is what lets `Results`
 * insert region dividers by watching for the value changing.
 */
export async function GET(req: Request) {
  await requireSession();

  const url = new URL(req.url);
  const parsed = inventoryQuerySchema.safeParse({
    checkin: url.searchParams.get("checkin") ?? undefined,
    checkout: url.searchParams.get("checkout") ?? undefined,
    resort: url.searchParams.get("resort") ?? undefined,
    branch: url.searchParams.get("branch") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { checkin, checkout, resort, branch } = parsed.data;

  const found = await prisma.resortInventory.findMany({
    where: {
      checkinDate: parseDate(checkin),
      checkoutDate: parseDate(checkout),
      ...(resort ? { resort: { slug: resort } } : {}),
      ...(branch ? { branchName: branch } : {}),
    },
    orderBy: [
      { region: "asc" },
      { resortName: "asc" },
      { branchName: "asc" },
      { roomType: "asc" },
    ],
    select: {
      id: true,
      resortName: true,
      branchName: true,
      roomType: true,
      region: true,
      available: true,
      closingSoon: true,
      detailUrl: true,
      syncedAt: true,
      resort: { select: { slug: true } },
    },
  });

  // Flatten the relation so a row describes its own resort — the client filters
  // by slug and must never have to reverse-engineer it from the display name.
  const rows = found.map(({ resort: r, ...row }) => ({ ...row, resortSlug: r.slug }));

  return NextResponse.json({ rows });
}
