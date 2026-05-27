import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/crypto";
import { CrawlStatus, CrawlStage } from "@/generated/prisma/enums";
import type { ResortSlug } from "@/generated/prisma/enums";
import { launchBrowser, newContextFromState } from "./_shared/browser";
import {
  loadStorageState,
  saveStorageState,
  clearStorageState,
} from "./_shared/session-store";
import { withDeadline, DeadlineExceeded } from "./_shared/timeout";
import { loadCrawler } from "./registry";
import type { CrawlerContext, InventoryRow, SearchParams } from "./types";

const DEFAULT_SESSION_TTL_HOURS = 6;
const STEP_BUDGET_MS = 55_000; // leave 5s headroom under Vercel's 60s cap

export interface RunResult {
  resortId: string;
  status: CrawlStatus;
  rowsUpserted: number;
  errorMessage?: string;
  errorStage?: CrawlStage;
  durationMs: number;
}

export interface RunOptions {
  /** "MANUAL" | "CRON" — recorded on CrawlLog */
  triggeredBy: string;
  /** Inngest run ID for cross-reference */
  inngestRunId?: string;
  /** Force a fresh login even if cached session is valid */
  forceLogin?: boolean;
  /** Search window. Defaults to today → today+7 in KST. */
  search?: SearchParams;
}

function defaultSearch(): SearchParams {
  const now = new Date();
  const checkin = new Date(now);
  checkin.setHours(0, 0, 0, 0);
  const checkout = new Date(checkin);
  checkout.setDate(checkout.getDate() + 7);
  return { checkin, checkout };
}

export async function runResortCrawl(
  slug: ResortSlug,
  opts: RunOptions,
): Promise<RunResult> {
  const startedAt = new Date();
  const search = opts.search ?? defaultSearch();

  const resort = await prisma.resort.findUnique({ where: { slug } });
  if (!resort) throw new Error(`Resort not found: ${slug}`);

  const account = await prisma.resortAccount.findFirst({
    where: { resortId: resort.id, isPrimary: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!account) {
    throw new Error(`No primary ResortAccount for ${slug}. Add one at /admin/accounts.`);
  }

  const log = await prisma.crawlLog.create({
    data: {
      resortId: resort.id,
      resortName: resort.name,
      status: CrawlStatus.RUNNING,
      startedAt,
      inngestRunId: opts.inngestRunId,
      triggeredBy: opts.triggeredBy,
    },
  });

  const logger = (msg: string, meta?: Record<string, unknown>) => {
    console.log(`[crawl ${slug}] ${msg}`, meta ?? "");
  };

  let stage: CrawlStage = CrawlStage.VALIDATE;
  let errorMessage: string | undefined;
  let rowsUpserted = 0;
  let status: CrawlStatus = CrawlStatus.FAILED;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;

  try {
    browser = await launchBrowser();
    const crawler = await loadCrawler(slug);

    const cached = await loadStorageState(resort.id);
    const initialState = cached && !cached.expired ? cached.storageState : null;
    const context = await newContextFromState(browser, initialState);
    const page = await context.newPage();

    const ctx: CrawlerContext = {
      resortId: resort.id,
      slug,
      context,
      page,
      credentials: {
        id: decrypt(account.idEncrypted),
        pw: decrypt(account.pwEncrypted),
      },
      log: logger,
    };

    // Stage 1: validate session
    stage = CrawlStage.VALIDATE;
    const sessionOk = !opts.forceLogin && initialState
      ? await withDeadline("validate", STEP_BUDGET_MS, () => crawler.validateSession(ctx))
      : false;

    // Stage 2: login if needed
    if (!sessionOk) {
      stage = CrawlStage.LOGIN;
      logger("session invalid or absent, performing login");
      await withDeadline("login", STEP_BUDGET_MS, () => crawler.login(ctx));
      await saveStorageState(
        resort.id,
        context,
        DEFAULT_SESSION_TTL_HOURS * 3600 * 1000,
      );
    } else {
      logger("session valid, skipping login");
    }

    // Stage 3: search
    stage = CrawlStage.SEARCH;
    const rows: InventoryRow[] = await withDeadline(
      "search",
      STEP_BUDGET_MS,
      () => crawler.searchAvailability(ctx, search),
    );

    // Stage 4: upsert
    stage = CrawlStage.UPSERT;
    rowsUpserted = await upsertInventory(resort.id, resort.name, rows, search);
    status = CrawlStatus.SUCCESS;
    logger("crawl complete", { rows: rowsUpserted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errorMessage = msg;
    if (e instanceof DeadlineExceeded) status = CrawlStatus.FAILED;

    // If login failed, clear cached state so next run forces fresh login.
    if (stage === CrawlStage.LOGIN || stage === CrawlStage.VALIDATE) {
      await clearStorageState(resort.id).catch(() => undefined);
    }
    logger("crawl failed", { stage, error: msg });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  await prisma.crawlLog.update({
    where: { id: log.id },
    data: {
      status,
      finishedAt,
      durationMs,
      errorMessage,
      errorStage: errorMessage ? stage : null,
      rowsUpserted: status === CrawlStatus.SUCCESS ? rowsUpserted : null,
    },
  });

  return {
    resortId: resort.id,
    status,
    rowsUpserted,
    errorMessage,
    errorStage: errorMessage ? stage : undefined,
    durationMs,
  };
}

async function upsertInventory(
  resortId: string,
  resortName: string,
  rows: InventoryRow[],
  search: SearchParams,
): Promise<number> {
  if (rows.length === 0) return 0;
  const now = new Date();
  // Process sequentially to avoid hammering the pooler with parallel writes
  // during a single crawl pass; volume per resort is small (~50 rows max).
  let count = 0;
  for (const row of rows) {
    await prisma.resortInventory.upsert({
      where: {
        uniq_inventory_row: {
          resortId,
          branchName: row.branchName,
          roomType: row.roomType,
          checkinDate: search.checkin,
          checkoutDate: search.checkout,
        },
      },
      create: {
        resortId,
        resortName,
        branchName: row.branchName,
        roomType: row.roomType,
        region: row.region,
        checkinDate: search.checkin,
        checkoutDate: search.checkout,
        available: row.available,
        closingSoon: row.closingSoon,
        detailUrl: row.detailUrl ?? null,
        syncedAt: now,
      },
      update: {
        resortName,
        region: row.region,
        available: row.available,
        closingSoon: row.closingSoon,
        detailUrl: row.detailUrl ?? null,
        syncedAt: now,
      },
    });
    count++;
  }
  return count;
}
