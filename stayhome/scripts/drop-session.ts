import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { ResortSlug } from "../src/generated/prisma/enums";

/**
 * Drop a resort's cached login session so the next crawl has to log in.
 *
 * Useful for proving the login path itself works somewhere it has never run —
 * a valid session makes a successful crawl say nothing about login.
 *
 *   npx tsx scripts/drop-session.ts LOTTE
 */
const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const slug = (process.argv[2] ?? "LOTTE") as ResortSlug;
  const resort = await prisma.resort.findUnique({ where: { slug } });
  if (!resort) throw new Error(`resort not found: ${slug}`);

  const before = await prisma.resortSession.findUnique({
    where: { resortId: resort.id },
  });
  console.log(
    "before:",
    before ? { expiresAt: before.expiresAt, updatedAt: before.updatedAt } : null,
  );

  const deleted = await prisma.resortSession.deleteMany({
    where: { resortId: resort.id },
  });
  console.log(`deleted ${deleted.count} session row(s) for ${slug}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
