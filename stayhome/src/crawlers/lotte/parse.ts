import type { CrawlerContext, InventoryRow } from "../types";
import { LOTTE, type LotteBranch } from "./config";

const CLOSED_TOKENS = ["마감", "매진", "예약불가", "선택 불가"];
const CLOSING_SOON_TOKENS = ["마감임박", "잔여"];

/**
 * Parse the results page that follows a single-branch search. Lotte's site
 * doesn't expose `data-*` hooks on result rows — we rely on the `<li>` list
 * structure that codegen revealed and extract text content per row.
 *
 * `branch` is passed in (rather than parsed from the page) because the search
 * was constrained to one branch before we got here — the row text rarely
 * repeats the branch name.
 */
export async function parseResults(
  ctx: CrawlerContext,
  branch: LotteBranch,
): Promise<InventoryRow[]> {
  const { page, log } = ctx;

  // Heuristic: result rows are <li> elements inside the page main content.
  // Filter to those that contain at least one heading-like text node so we
  // skip nav / footer / breadcrumb <li>s.
  const items = await page
    .locator("main li, [role='main'] li, .room-list li, body li")
    .filter({ has: page.locator("h1, h2, h3, h4, [class*='title'], [class*='name']") })
    .all();

  log("[lotte] result candidates", { count: items.length });

  const out: InventoryRow[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const titleEl = item
      .locator("h1, h2, h3, h4, [class*='title'], [class*='name']")
      .first();
    const roomType = (await titleEl.textContent())?.trim() ?? "";
    if (!roomType) continue;

    const key = `${branch.value}::${roomType}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const fullText = ((await item.textContent()) ?? "").replace(/\s+/g, " ").trim();
    const closingSoon = CLOSING_SOON_TOKENS.some((t) => fullText.includes(t));
    const closed = CLOSED_TOKENS.some((t) => fullText.includes(t));

    // detail link (first <a> in the row)
    let detailUrl: string | undefined;
    const anchor = item.locator("a").first();
    if ((await anchor.count()) > 0) {
      const href = await anchor.getAttribute("href");
      if (href) {
        detailUrl = href.startsWith("http")
          ? href
          : new URL(href, LOTTE.baseUrl).toString();
      }
    }

    out.push({
      branchName: branch.value,
      roomType,
      region: branch.region,
      available: !closed,
      closingSoon,
      detailUrl,
    });
  }

  return out;
}
