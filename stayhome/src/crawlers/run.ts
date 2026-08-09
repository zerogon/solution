import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
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
import { parseDate, todayKstIso, addDaysUtc, toIsoDate } from "@/lib/utils";
import { loadCrawler } from "./registry";
import type { CrawlerContext, InventoryRow, SearchParams } from "./types";

const DEFAULT_SESSION_TTL_HOURS = 6;
const STEP_BUDGET_MS = 55_000; // leave 5s headroom under Vercel's 60s cap

/**
 * Wall-clock budget for one call, measured from entry. Browser launch, session
 * validation and login all come out of it before any window is searched, so it
 * sits below STEP_BUDGET_MS rather than at it.
 */
const DEFAULT_BUDGET_MS = 50_000;

/**
 * How long to assume the *next* window will take before any window has been
 * measured, and thus how much budget must remain to start one. A measured
 * window (4 branch API calls + one batched upsert) runs ~2.5s against the live
 * site; this leaves room for a bad one without idling away a third of the pass.
 * The search itself is separately capped at the remaining budget, so an
 * underestimate cannot actually overrun the invocation — it only wastes a step.
 */
const INITIAL_WINDOW_ESTIMATE_MS = 8_000;

/**
 * Rows per INSERT. Postgres caps a statement at 65535 bind parameters and each
 * row binds 12, so the hard ceiling is ~5400; 1000 keeps a wide margin while
 * still costing only a handful of round trips. This only started to matter
 * when crawlers began reporting whole spans — a single SONO window is ~3900
 * rows (32 stores × ~23 days), where it used to be ~170.
 */
const UPSERT_CHUNK_ROWS = 1_000;

export interface RunResult {
  resortId: string;
  status: CrawlStatus;
  rowsUpserted: number;
  errorMessage?: string;
  errorStage?: CrawlStage;
  durationMs: number;
  /**
   * Windows fully searched *and* upserted in this call, counted from the front
   * of `opts.windows`. The scheduler resumes with `windows.slice(this)` — see
   * `src/lib/inngest/functions/crawl-resort.ts`. Always `windows.length` when
   * the budget held; short when it ran out; short-and-FAILED when a window threw.
   */
  windowsCompleted: number;
  /** `opts.windows.length` (or 1 for the single-window form). */
  windowsRequested: number;
}

export interface RunOptions {
  /** "MANUAL" | "CRON" — recorded on CrawlLog */
  triggeredBy: string;
  /** Inngest run ID for cross-reference */
  inngestRunId?: string;
  /** Force a fresh login even if cached session is valid */
  forceLogin?: boolean;
  /** Search window. Defaults to today → today+1 (KST), matching the UI default. */
  search?: SearchParams;
  /**
   * Several windows crawled in ONE browser session, in order. Takes precedence
   * over `search`.
   *
   * Login is by far the dominant cost of a crawl (browser launch + a real form
   * submit ≈ 10-25s) while an extra window is only 4 more JSON calls, so the
   * scheduler batches windows here instead of calling this function per window.
   */
  windows?: SearchParams[];
  /** Wall-clock budget from entry. Defaults to {@link DEFAULT_BUDGET_MS}. */
  budgetMs?: number;
}

function defaultSearch(): SearchParams {
  // UTC-midnight Dates, same convention as parseDate on the read path —
  // local-time Dates here would shift the @db.Date key by a day on KST.
  // One night, matching SearchView's default query so the seeded cache is
  // actually served on first load.
  const checkin = parseDate(todayKstIso());
  return { checkin, checkout: addDaysUtc(checkin, 1) };
}

export async function runResortCrawl(
  slug: ResortSlug,
  opts: RunOptions,
): Promise<RunResult> {
  const startedAt = new Date();
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const deadline = startedAt.getTime() + budgetMs;
  const windows =
    opts.windows && opts.windows.length > 0
      ? opts.windows
      : [opts.search ?? defaultSearch()];

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
  let windowsCompleted = 0;
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
      // No `writeAudit(REVEAL_CREDENTIAL)` here, deliberately — see 보안 규칙 2
      // in CLAUDE.md. That action records a *person* seeing plaintext; this
      // plaintext goes straight into a Playwright form in the same process and
      // never leaves it. The machine-side trail is `CrawlLog` (triggeredBy,
      // timing, result, failure stage), which the run already writes.
      //
      // Auditing here would put 8 rows a day per resort into `audit_logs` and
      // bury the handful of rows that answer the question it exists for.
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

    // Stages 3+4, once per window, all on the one authenticated session.
    // A window is only counted as completed after its rows are upserted, so a
    // budget cut or a throw resumes exactly where this left off.
    let windowEstimateMs = INITIAL_WINDOW_ESTIMATE_MS;
    // Stays already filed by an earlier window in THIS pass. A crawler that
    // reports `row.stay` answers for dates it wasn't asked about (SONO returns
    // ~23 days per call), and searching those windows again would re-fetch
    // bytes we already have. Crawlers that don't report stays never populate
    // this, so nothing is skipped for them.
    const covered = new Set<string>();
    let windowsSkipped = 0;
    for (const window of windows) {
      // Checked ahead of the budget: a covered window costs nothing, and
      // stopping short of one would make the scheduler re-crawl it next pass
      // with a fresh (empty) `covered` set.
      if (covered.has(stayKey(window.checkin, window.checkout))) {
        windowsCompleted++;
        windowsSkipped++;
        continue;
      }

      const remaining = deadline - Date.now();
      if (remaining < windowEstimateMs) {
        logger("budget exhausted, deferring remaining windows", {
          done: windowsCompleted,
          left: windows.length - windowsCompleted,
          remainingMs: remaining,
        });
        break;
      }
      const windowStart = Date.now();

      stage = CrawlStage.SEARCH;
      const rows: InventoryRow[] = await withDeadline(
        "search",
        Math.min(STEP_BUDGET_MS, remaining),
        () => crawler.searchAvailability(ctx, window),
      );

      stage = CrawlStage.UPSERT;
      rowsUpserted += await upsertInventory(resort.id, resort.name, rows, window);
      windowsCompleted++;

      // Only after the rows are committed: a window is "covered" when its data
      // is in the table, not when it came back over the wire.
      for (const row of rows) {
        if (row.stay) covered.add(stayKey(row.stay.checkin, row.stay.checkout));
      }

      // Track the slowest window seen rather than the mean: the budget check
      // must survive the next window being as bad as the worst so far.
      windowEstimateMs = Math.max(windowEstimateMs, Date.now() - windowStart);
    }
    status = CrawlStatus.SUCCESS;
    logger("crawl complete", {
      rows: rowsUpserted,
      windows: `${windowsCompleted}/${windows.length}`,
      skipped: windowsSkipped,
    });
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
      // Recorded even on FAILED: a multi-window run can die on window 7 with
      // six windows' worth of rows already committed, and reporting null there
      // would make the log claim nothing was collected.
      rowsUpserted,
    },
  });

  return {
    resortId: resort.id,
    status,
    rowsUpserted,
    errorMessage,
    errorStage: errorMessage ? stage : undefined,
    durationMs,
    windowsCompleted,
    windowsRequested: windows.length,
  };
}

/** Stable identity for a stay, in the app's `YYYY-MM-DD` convention. */
function stayKey(checkin: Date, checkout: Date): string {
  return `${toIsoDate(checkin)}/${toIsoDate(checkout)}`;
}

async function upsertInventory(
  resortId: string,
  resortName: string,
  rows: InventoryRow[],
  search: SearchParams,
): Promise<number> {
  if (rows.length === 0) return 0;
  const now = new Date();

  // A row's own `stay` wins over the requested window; see `InventoryRow`.
  const requested = stayKey(search.checkin, search.checkout);

  // Deduplicate on the unique key first. A single INSERT cannot touch the same
  // conflict target twice ("ON CONFLICT DO UPDATE command cannot affect row a
  // second time"), and the room list occasionally repeats a room type. Last
  // occurrence wins, matching what the old row-at-a-time loop ended up storing.
  // The dates are part of that key now — one call's rows can span many stays.
  // The separator is written as an escape: this line used to carry a raw NUL
  // byte, which made the file `data` to `file(1)` and invisible to grep.
  const byKey = new Map<string, { row: InventoryRow; stay: string }>();
  for (const row of rows) {
    const stay = row.stay ? stayKey(row.stay.checkin, row.stay.checkout) : requested;
    byKey.set(`${stay}\u0000${row.branchName}\u0000${row.roomType}`, { row, stay });
  }

  // One statement per chunk. Prisma's `upsert` per row — and even
  // `$transaction([...upserts])` under the pg driver adapter — issues a
  // separate round trip each, which measured ~5s per window against Neon and
  // dominated the pass budget (and so the browser-launch count for a full
  // sweep). Chunking is not a retreat from that: it exists only for the
  // bind-parameter ceiling (see UPSERT_CHUNK_ROWS) and still costs a handful
  // of round trips where the old loop cost thousands.
  //
  // Dates bind as 'YYYY-MM-DD' strings cast to `date` rather than as Date
  // objects: a Date would be sent as a timestamptz and cast using the
  // session's TimeZone, which is exactly the off-by-one-day this app's
  // UTC-midnight convention exists to prevent.
  const entries = [...byKey.values()];
  for (let i = 0; i < entries.length; i += UPSERT_CHUNK_ROWS) {
    const values = entries.slice(i, i + UPSERT_CHUNK_ROWS).map(({ row, stay }) => {
      const [checkin, checkout] = stay.split("/");
      return Prisma.sql`(
        ${randomUUID()}, ${resortId}, ${resortName}, ${row.branchName},
        ${row.roomType}, ${row.region}, ${checkin}::date, ${checkout}::date,
        ${row.available}, ${row.closingSoon}, ${row.detailUrl ?? null}, ${now}
      )`;
    });

    await prisma.$executeRaw`
      INSERT INTO resort_inventory (
        id, resort_id, resort_name, branch_name, room_type, region,
        checkin_date, checkout_date, available, closing_soon, detail_url, synced_at
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT (resort_id, branch_name, room_type, checkin_date, checkout_date)
      DO UPDATE SET
        resort_name  = EXCLUDED.resort_name,
        region       = EXCLUDED.region,
        available    = EXCLUDED.available,
        closing_soon = EXCLUDED.closing_soon,
        detail_url   = EXCLUDED.detail_url,
        synced_at    = EXCLUDED.synced_at
    `;
  }
  return entries.length;
}
