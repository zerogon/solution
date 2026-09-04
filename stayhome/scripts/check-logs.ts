import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

/**
 * 인스턴트를 KST로 찍는다. 기본 JSON 직렬화는 UTC(`…Z`)라 틀리지는 않지만
 * 눈으로 9시간을 더해야 한다 — 이 스크립트를 보는 사람은 항상 한국 시각을 묻는다.
 */
function kst(d: Date): string {
  return `${d.toISOString().replace("T", " ").slice(0, 19)}Z (KST ${new Date(
    d.getTime() + 9 * 3_600_000,
  )
    .toISOString()
    .replace("T", " ")
    .slice(0, 19)})`;
}

async function main() {
  const logs = await prisma.crawlLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      resortName: true,
      status: true,
      errorStage: true,
      errorMessage: true,
      rowsUpserted: true,
      durationMs: true,
      triggeredBy: true,
      startedAt: true,
    },
  });
  console.log("=== crawl_logs (latest 10) ===");
  console.log(
    JSON.stringify(
      logs.map((l) => ({ ...l, startedAt: kst(l.startedAt) })),
      null,
      2,
    ),
  );

  const inventoryCount = await prisma.resortInventory.count();
  const dateGroups = await prisma.resortInventory.groupBy({
    by: ["checkinDate", "checkoutDate"],
    _count: { _all: true },
    orderBy: { checkinDate: "asc" },
  });
  console.log(`\n=== resort_inventory (${inventoryCount} rows) ===`);
  // Adjacent checkin dates with similar counts indicate timezone-skewed duplicates.
  for (const g of dateGroups) {
    const ci = g.checkinDate.toISOString().slice(0, 10);
    const co = g.checkoutDate.toISOString().slice(0, 10);
    console.log(`${ci} → ${co}: ${g._count._all} rows`);
  }

  const sessions = await prisma.resortSession.findMany({
    select: { resortId: true, expiresAt: true, updatedAt: true },
  });
  console.log("\n=== resort_sessions ===");
  console.log(
    JSON.stringify(
      sessions.map((s) => ({
        ...s,
        expiresAt: kst(s.expiresAt),
        updatedAt: kst(s.updatedAt),
      })),
      null,
      2,
    ),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
