import type { Locator, Page } from "playwright-core";
import type { CrawlerContext, InventoryRow, SearchParams } from "../types";
import { LOTTE, type LotteBranch } from "./config";
import { parseResults } from "./parse";
import { formatDateKst } from "./format";

type Log = CrawlerContext["log"];

/** Click the first locator in `candidates` that resolves to at least one node. */
async function clickFirstMatch(
  candidates: Locator[],
  label: string,
  timeoutMs: number,
): Promise<void> {
  for (const c of candidates) {
    if ((await c.count()) > 0) {
      await c.first().click({ timeout: timeoutMs });
      return;
    }
  }
  throw new Error(`SEARCH_SELECTOR_MISS: ${label} — no candidate matched`);
}

async function openSearchPage(ctx: CrawlerContext) {
  const { page, log } = ctx;
  // Reset page state — previous branch's failure may have left the GNB menu
  // open or modals stacked on top, which intercepts subsequent clicks.
  log("[lotte] resetting to main before search");
  await page.goto(LOTTE.mainUrl, {
    waitUntil: "domcontentloaded",
    timeout: LOTTE.timeouts.navigation,
  });

  log("[lotte] opening menu → search");
  await page
    .getByRole("button", { name: LOTTE.login.menuButtonName })
    .click({ timeout: LOTTE.timeouts.modalOpen });
  await page
    .getByRole("link", { name: LOTTE.search.searchPageLinkName })
    .first()
    .click({ timeout: LOTTE.timeouts.modalOpen });
  await page.waitForLoadState("domcontentloaded", {
    timeout: LOTTE.timeouts.navigation,
  });
}

/**
 * Select a single day inside the open calendar modal. Tries stable selectors
 * (aria-label / data-date) first, falls back to "{month}월 {day}일" labels.
 * Does NOT handle month-arrow navigation — call `advanceCalendarToMonth` first
 * if the visible page differs from the target month.
 */
async function clickCalendarDay(page: Page, date: Date, log: Log) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const iso = formatDateKst(date);
  // Match exact day number text, allowing surrounding whitespace
  const dayRegex = new RegExp(`^\\s*${d}\\s*$`);

  log("[lotte] clicking calendar day", { iso });
  // Confirmed structure on Lotte: <a href="#" class="day">DD</a>
  // Prev/next-month trailing cells usually have an extra state class — exclude
  // common patterns so we pick the in-month cell when duplicates exist.
  await clickFirstMatch(
    [
      // Most specific: active-only `a.day` cells
      page
        .locator(
          'a.day:not(.disabled):not(.off):not(.prev):not(.next):not(.dimmed):not([aria-disabled="true"])',
        )
        .filter({ hasText: dayRegex }),
      // Any a.day cell
      page.locator("a.day").filter({ hasText: dayRegex }),
      // Generic fallbacks (kept for resilience if the class scheme changes)
      page.locator(`[data-date="${iso}"]`),
      page.locator(`[aria-label*="${y}년 ${m}월 ${d}일"]`),
      page.locator(`[aria-label*="${m}월 ${d}일"]`),
      page.getByRole("link", { name: String(d), exact: true }),
      page.getByRole("gridcell", { name: String(d), exact: true }),
      page.getByRole("button", { name: new RegExp(`(^|\\s)${d}(일|$)`) }),
    ],
    `calendar day ${iso}`,
    LOTTE.timeouts.modalOpen,
  );
}

/**
 * If the visible calendar isn't on the target month, click the "next month"
 * arrow until it matches (or give up after 12 hops).
 */
async function advanceCalendarToMonth(page: Page, date: Date, log: Log) {
  const targetY = date.getFullYear();
  const targetM = date.getMonth() + 1;
  const monthMarker = `${targetY}년 ${targetM}월`;

  for (let i = 0; i < 12; i++) {
    const hasTarget =
      (await page.getByText(monthMarker, { exact: false }).count()) > 0;
    if (hasTarget) {
      log("[lotte] calendar showing target month", { monthMarker });
      return;
    }
    // try common next-month patterns
    const candidates: Locator[] = [
      page.getByRole("button", { name: "다음 달" }),
      page.getByRole("button", { name: "다음달" }),
      page.getByRole("button", { name: "다음" }),
      page.locator('[aria-label*="다음"]'),
      page.locator('button:has-text(">")'),
    ];
    let clicked = false;
    for (const c of candidates) {
      if ((await c.count()) > 0) {
        await c.first().click({ timeout: LOTTE.timeouts.modalOpen });
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      log("[lotte] no next-month control; bailing", { monthMarker, hop: i });
      return; // give up; clickCalendarDay may still succeed if current view contains target day
    }
  }
}

async function pickDateRange(page: Page, params: SearchParams, log: Log) {
  log("[lotte] opening date-range picker");
  await page
    .getByRole("button", { name: LOTTE.search.dateRangeButtonName })
    .first()
    .click({ timeout: LOTTE.timeouts.modalOpen });

  await advanceCalendarToMonth(page, params.checkin, log);
  await clickCalendarDay(page, params.checkin, log);

  await advanceCalendarToMonth(page, params.checkout, log);
  await clickCalendarDay(page, params.checkout, log);
}

async function pickBranch(page: Page, branch: LotteBranch, log: Log) {
  log("[lotte] opening branch picker", { branch: branch.value });
  await page
    .getByRole("button", { name: LOTTE.search.branchButtonName })
    .first()
    .click({ timeout: LOTTE.timeouts.modalOpen });

  await clickFirstMatch(
    [
      page.getByRole("link", { name: branch.value, exact: true }),
      page.getByRole("link", { name: branch.value }),
      page.getByText(branch.value, { exact: true }),
    ],
    `branch link "${branch.value}"`,
    LOTTE.timeouts.modalOpen,
  );
}

async function submitSearch(page: Page, log: Log) {
  log("[lotte] submitting search");
  // Either the standing "객실 검색" link/button — try both
  await clickFirstMatch(
    [
      page.getByRole("button", { name: LOTTE.search.submitButtonName }),
      page.getByRole("link", { name: LOTTE.search.submitButtonName }),
    ],
    "search submit",
    LOTTE.timeouts.modalOpen,
  );
  await page.waitForLoadState("domcontentloaded", {
    timeout: LOTTE.timeouts.searchSubmit,
  });
}

async function searchOneBranch(
  ctx: CrawlerContext,
  params: SearchParams,
  branch: LotteBranch,
): Promise<InventoryRow[]> {
  const { page, log } = ctx;

  await openSearchPage(ctx);
  await pickDateRange(page, params, log);
  await pickBranch(page, branch, log);
  await submitSearch(page, log);

  const rows = await parseResults(ctx, branch);
  log("[lotte] branch parsed", { branch: branch.value, rows: rows.length });
  return rows;
}

export async function performSearch(
  ctx: CrawlerContext,
  params: SearchParams,
): Promise<InventoryRow[]> {
  const { log } = ctx;

  // If params.region is given, restrict to that one branch (matched by label
  // or value). Otherwise iterate all known branches.
  const branches = params.region
    ? LOTTE.branches.filter(
        (b) => b.label === params.region || b.value === params.region,
      )
    : LOTTE.branches;

  if (branches.length === 0) {
    log("[lotte] no branches matched region; nothing to search", {
      region: params.region,
    });
    return [];
  }

  const all: InventoryRow[] = [];
  for (const branch of branches) {
    try {
      const rows = await searchOneBranch(ctx, params, branch);
      all.push(...rows);
    } catch (e) {
      // Don't abort the whole crawl for one branch — record and continue.
      log("[lotte] branch search failed", {
        branch: branch.value,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return all;
}
