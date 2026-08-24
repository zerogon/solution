import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { inventoryQuerySchema } from "@/lib/validators";
import { parseDate } from "@/lib/utils";
import { isPriceKind } from "@/lib/price";

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
      price: true,
      priceKind: true,
      syncedAt: true,
      resort: { select: { slug: true } },
    },
  });

  // Flatten the relation so a row describes its own resort — the client filters
  // by slug and must never have to reverse-engineer it from the display name.
  //
  // 요금은 반대로 **접어서** 내보낸다. `price`와 `priceKind`는 "둘 다이거나 둘 다
  // 아니다"라는 규약을 갖는데, 두 필드로 나란히 두면 클라이언트가 한쪽만 있는 상태를
  // 표현할 수 있게 되고 그건 라벨 없는 숫자를 그리는 길이다. DB는 컬럼 두 개로
  // 저장하지만 화면이 받는 것은 하나의 값이거나 null이다.
  const rows = found.map(({ resort: r, price, priceKind, ...row }) => ({
    ...row,
    resortSlug: r.slug,
    price:
      price != null && isPriceKind(priceKind) ? { amount: price, kind: priceKind } : null,
  }));

  return NextResponse.json({ rows });
}
