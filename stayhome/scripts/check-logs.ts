import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

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
  console.log(JSON.stringify(logs, null, 2));

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
  console.log(JSON.stringify(sessions, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
