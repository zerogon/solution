import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { decrypt } from "@/lib/crypto";
import { CrawlStatus, CrawlStage } from "@/generated/prisma/enums";
import type { ResortSlug } from "@/generated/prisma/enums";
import { closeBrowser, launchBrowser, newContextFromState } from "./_shared/browser";
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
 * row binds 14, so the hard ceiling is ~4680; 1000 keeps a wide margin while
 * still costing only a handful of round trips. This only started to matter
 * when crawlers began reporting whole spans — a single SONO window is ~3900
 * rows (32 stores × ~23 days), where it used to be ~170.
 */
const UPSERT_CHUNK_ROWS = 1_000;

/**
 * 유령 행 삭제 한 문장이 다루는 `(지점, 체크인, 체크아웃)` 그룹 수.
 *
 * 그룹당 바인드 파라미터가 3개라 상한 65,535까지는 한참 남지만, 소노처럼 지점 32곳 ×
 * 날짜 50개가 한 패스에 들어오는 경우를 대비해 upsert와 같은 방식으로 끊는다.
 */
const DELETE_CHUNK_GROUPS = 2_000;

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
  /**
   * 요금이 붙은 행 수. 거의 항상 0이다 — 요금은 사용자가 "최신화"로 지목한
   * (지점, 날짜)에만 붙는다.
   *
   * 화면에 그대로 보여주기 위한 값이다. 요금 수집은 예산에 걸리면 조용히 일부만
   * 붙이고 끝나는데, 그 절단이 숫자로 드러나지 않으면 "요금이 없는 방"과
   * "시간이 모자라 못 물어본 방"이 화면에서 똑같이 빈칸으로 보인다.
   */
  pricedRows: number;
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
  let pricedRows = 0;
  let windowsCompleted = 0;
  let status: CrawlStatus = CrawlStatus.FAILED;
  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;

  try {
    browser = await launchBrowser(logger);
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
        // Not decrypted because it is not encrypted: `memo` is a plaintext
        // column. It travels here for HANWHA, whose login demands a second
        // secret (회원권 비밀번호) that has nowhere else to live today — see
        // the grade note on `CrawlerContext.credentials`.
        memo: account.memo ?? undefined,
      },
      log: logger,
      // 이 패스의 마감 시각. 선택적인 추가 작업(요금 조회 등)을 할지 말지 크롤러가
      // 판단하려면 "몇 초 남았나"를 알아야 하는데, 로그인에 이미 얼마를 썼는지는
      // 크롤러가 관측할 수 없다. 아래 `withDeadline("search", …)`가 같은 시계를 본다.
      deadlineAt: deadline,
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
      pricedRows += rows.filter((r) => r.price).length;
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
    if (browser) await closeBrowser(browser, logger);
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
    pricedRows,
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
        ${row.available}, ${row.closingSoon}, ${row.detailUrl ?? null},
        ${row.price?.amount ?? null}, ${row.price?.kind ?? null}, ${now}
      )`;
    });

    // `price`/`price_kind`가 세 곳(컬럼 목록·VALUES·DO UPDATE SET) 전부에 있어야 한다.
    // DO UPDATE SET에서만 빠지면 첫 INSERT에는 요금이 붙고 그 뒤로는 `synced_at`만
    // 갱신되면서 요금이 영원히 고정된다 — 즉 **행은 fresh인데 요금은 몇 주 전 것**이
    // 되고, 신선도 축이 요금에 대해 거짓말을 시작한다. 이 파일은 raw SQL이라 타입 검사도
    // 빌드도 그걸 못 잡고, 한 번만 돌려서는 드러나지 않는다(같은 크롤을 두 번 돌려야 한다).
    //
    // `COALESCE(EXCLUDED.price, resort_inventory.price)`로 옛 요금을 살리고 싶어지는
    // 자리인데, 그러면 안 된다. 한 행의 모든 컬럼이 이 한 문장으로 함께 쓰이기 때문에
    // 지금은 **요금의 나이 = `synced_at`**이 항상 성립하고, 조회 화면의 신선도 판정이
    // 요금에도 그대로 적용된다. COALESCE는 그 등식을 깨서 요금이 행보다 늙을 수 있게
    // 만든다 — 요금이 없어지는 것은 이 기능의 정의이고, 남아 있는 것이 버그다.
    await prisma.$executeRaw`
      INSERT INTO resort_inventory (
        id, resort_id, resort_name, branch_name, room_type, region,
        checkin_date, checkout_date, available, closing_soon, detail_url,
        price, price_kind, synced_at
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT (resort_id, branch_name, room_type, checkin_date, checkout_date)
      DO UPDATE SET
        resort_name  = EXCLUDED.resort_name,
        region       = EXCLUDED.region,
        available    = EXCLUDED.available,
        closing_soon = EXCLUDED.closing_soon,
        detail_url   = EXCLUDED.detail_url,
        price        = EXCLUDED.price,
        price_kind   = EXCLUDED.price_kind,
        synced_at    = EXCLUDED.synced_at
    `;
  }

  await removeVanishedRows(resortId, entries, now);
  return entries.length;
}

/**
 * 이번 응답에서 사라진 행을 지운다.
 *
 * 쓰기 경로가 순수 upsert라, 어제 있었고 오늘 응답에 없는 객실은 아무도 건드리지
 * 않아 옛 값 그대로 남는다. 2026-08-24에 롯데 속초 8/24→8/25가 정확히 그랬다 —
 * 16행은 그날 갱신됐는데 호텔 객실 3종만 08-11의 `available=true`를 단 채 남아
 * 화면 맨 위에 초록 배지로 떠 있었고, 실제 사이트에는 그 방이 없었다.
 *
 * ## 무엇을 근거로 지우는가
 *
 * 판정 단위는 `(지점, 체크인, 체크아웃)` 그룹이고 규칙은 하나다:
 *
 * > 그 그룹에서 **1행 이상 받았다면** 사이트가 그 지점·그 날짜에 대해 답한 것이다.
 * > 그 답에 없는 객실은 지금 예약할 수 없다.
 *
 * **0행 그룹은 절대 건드리지 않는다.** 그룹 목록을 방금 쓴 행에서 뽑기 때문에
 * 그건 자동으로 보장된다 — 응답이 비었으면 그룹이 존재하지 않는다. 이 구분이
 * 이 함수의 전부다. 지점 단위 실패는 조용히 0행이 되는데(`lotte/search.ts`가
 * 예외를 삼키고 계속한다) 그걸 "전부 마감"으로 읽으면 크롤 실패가 "전 객실 매진"으로
 * 발행된다.
 *
 * ## 왜 `available = false`가 아니라 삭제인가
 *
 * 마킹은 "예약 불가"라는 주장인데, 소노·리솜·오크밸리·한화는 밤 하나가 결측이면
 * 행을 아예 만들지 않으므로 사라진 행에는 "불가"와 "판정 못 함"이 섞여 있다.
 * 이 프로젝트의 규약은 판정할 수 없으면 행을 만들지 않는 것이고(AGENTS.md의
 * `InventoryRow.stay` 절), 삭제가 그 규약과 같은 말이다. 지워진 자리는 조회에서
 * "데이터 없음"이고, 다음 크롤이 답을 받으면 그대로 복구된다.
 *
 * ## 왜 `synced_at <> now`로 충분한가
 *
 * 이 호출이 쓴 행은 전부 같은 `now`를 갖는다(모든 청크가 한 값을 공유). 그래서
 * "우리가 답을 받은 그룹 안에서 우리가 쓰지 않은 행"은 정확히 그 그룹의
 * `synced_at <> now`다. 객실명 목록을 통째로 바인딩할 필요가 없어 파라미터가
 * 행 수가 아니라 **그룹 수**에 비례한다 — 소노 한 패스가 수천 행이라 이 차이가 크다.
 */
async function removeVanishedRows(
  resortId: string,
  entries: { row: InventoryRow; stay: string }[],
  now: Date,
): Promise<void> {
  const groups = new Map<string, { branchName: string; checkin: string; checkout: string }>();
  for (const { row, stay } of entries) {
    const [checkin, checkout] = stay.split("/");
    groups.set(`${stay}\u0000${row.branchName}`, {
      branchName: row.branchName,
      checkin,
      checkout,
    });
  }

  const all = [...groups.values()];
  for (let i = 0; i < all.length; i += DELETE_CHUNK_GROUPS) {
    const tuples = all
      .slice(i, i + DELETE_CHUNK_GROUPS)
      .map((g) => Prisma.sql`(${g.branchName}, ${g.checkin}::date, ${g.checkout}::date)`);

    await prisma.$executeRaw`
      DELETE FROM resort_inventory
      WHERE resort_id = ${resortId}
        AND (branch_name, checkin_date, checkout_date) IN (${Prisma.join(tuples)})
        AND synced_at <> ${now}
    `;
  }
}
