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
 * check-in/check-out window, optionally narrowed to one branch.
 *
 * `branch` filters by `ResortInventory.branchName` (= LOTTE.branches[].value,
 * e.g. "롯데리조트 속초") — NOT the geographic `region` column. Dates are parsed
 * with the same `parseDate` helper used on the write path so `@db.Date`
 * equality matching holds.
 */
export async function GET(req: Request) {
  await requireSession();

  const url = new URL(req.url);
  const parsed = inventoryQuerySchema.safeParse({
    checkin: url.searchParams.get("checkin") ?? undefined,
    checkout: url.searchParams.get("checkout") ?? undefined,
    branch: url.searchParams.get("branch") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_query", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { checkin, checkout, branch } = parsed.data;

  const rows = await prisma.resortInventory.findMany({
    where: {
      checkinDate: parseDate(checkin),
      checkoutDate: parseDate(checkout),
      ...(branch ? { branchName: branch } : {}),
    },
    orderBy: [{ region: "asc" }, { branchName: "asc" }, { roomType: "asc" }],
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
    },
  });

  return NextResponse.json({ rows });
}
