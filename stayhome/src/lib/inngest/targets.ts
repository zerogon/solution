import { prisma } from "@/lib/prisma";
import { isCrawlerRegistered } from "@/crawlers/registry";
import type { ResortSlug } from "@/generated/prisma/enums";

/**
 * Resorts a scheduled pass should crawl: flagged `active` in the DB *and*
 * backed by a registered crawler module.
 *
 * Both conditions matter and mean different things — `active` is the operator's
 * switch (credentials verified, site behaving), while registration is whether
 * the code exists at all. Through Phase F the two drift apart constantly, and
 * fanning out to an unregistered slug would just produce a FAILED CrawlLog row
 * and a Slack alert for work that was never implemented.
 */
export async function listCrawlableResorts(): Promise<ResortSlug[]> {
  const resorts = await prisma.resort.findMany({
    where: { active: true },
    select: { slug: true },
    orderBy: { slug: "asc" },
  });
  return resorts.map((r) => r.slug).filter(isCrawlerRegistered);
}
