import type { CrawlerModule } from "./types";
import { ResortSlug } from "@/generated/prisma/enums";

type LoaderFn = () => Promise<CrawlerModule>;

/**
 * Slug → lazy module loader. Dynamic import keeps unused resort crawlers out
 * of the cold-start bundle.
 *
 * Adding a new resort:
 *   1. Build `src/crawlers/<slug>/index.ts` exporting a CrawlerModule.
 *   2. Add the slug entry here.
 *   3. Flip `Resort.active = true` for that row.
 */
const LOADERS: Partial<Record<ResortSlug, LoaderFn>> = {
  [ResortSlug.LOTTE]: async () => (await import("./lotte")).lotteCrawler,
  [ResortSlug.RESOM]: async () => (await import("./resom")).resomCrawler,
  // [ResortSlug.HANWHA]: async () => (await import("./hanwha")).hanwhaCrawler,
  [ResortSlug.OAKVALLEY]: async () => (await import("./oakvalley")).oakvalleyCrawler,
  [ResortSlug.SONO]: async () => (await import("./sono")).sonoCrawler,
};

export async function loadCrawler(slug: ResortSlug): Promise<CrawlerModule> {
  const loader = LOADERS[slug];
  if (!loader) throw new Error(`No crawler module registered for slug: ${slug}`);
  return loader();
}

export function isCrawlerRegistered(slug: ResortSlug): boolean {
  return LOADERS[slug] !== undefined;
}
