import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { ResortSlug } from "../src/generated/prisma/enums";

/**
 * Flip a resort's `active` flag — the operator's switch for putting a crawler
 * into service.
 *
 * One flag turns on two things, which is why it deserves a command rather than
 * a remembered SQL statement:
 *   - `listCrawlableResorts()` (lib/inngest/targets.ts) fans the 3-hour cron
 *     out to it, and
 *   - `getSearchCatalog()` (lib/resort-catalog.ts) shows its properties on the
 *     search screen.
 * Both also require the code side (a registered crawler, a CATALOG entry), so
 * this prints those too — `active` alone silently does nothing if either is
 * missing, and the symptom is an empty filter rather than an error.
 *
 *   npx tsx scripts/set-active.ts RESOM true
 *   npx tsx scripts/set-active.ts RESOM false
 */
const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const slugArg = (process.argv[2] ?? "").toUpperCase();
  const nextArg = process.argv[3] ?? "true";
  if (!(slugArg in ResortSlug)) {
    throw new Error(
      `Unknown slug: "${slugArg}". One of ${Object.keys(ResortSlug).join(", ")}`,
    );
  }
  if (nextArg !== "true" && nextArg !== "false") {
    throw new Error(`Expected "true" or "false", got "${nextArg}"`);
  }
  const slug = slugArg as ResortSlug;
  const active = nextArg === "true";

  const before = await prisma.resort.findUnique({
    where: { slug },
    select: { name: true, active: true },
  });
  if (!before) throw new Error(`Resort row missing for ${slug} — run npm run db:seed`);
  console.log(`before: ${slug} (${before.name}) active=${before.active}`);

  if (before.active === active) {
    console.log(`already active=${active}; nothing to do`);
  } else {
    await prisma.resort.update({ where: { slug }, data: { active } });
    console.log(`after:  ${slug} active=${active}`);
  }

  // The code-side halves of the same switch. Reported rather than enforced:
  // turning a resort off should work even when its crawler has been removed.
  const { isCrawlerRegistered } = await import("../src/crawlers/registry");
  console.log(`crawler registered: ${isCrawlerRegistered(slug)}`);

  const all = await prisma.resort.findMany({
    where: { active: true },
    select: { slug: true },
    orderBy: { slug: "asc" },
  });
  console.log(
    "active resorts:",
    all.map((r) => `${r.slug}${isCrawlerRegistered(r.slug) ? "" : " (no crawler!)"}`).join(", "),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
