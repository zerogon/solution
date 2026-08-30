import type { Page } from "playwright-core";
import { addDaysUtc, toIsoDate } from "@/lib/utils";
import { selectBranches } from "../_shared/branches";
import type { CrawlerContext, InventoryRow, SearchParams } from "../types";
import { HANWHA, type HanwhaBranch } from "./config";
import { formatDateCompact } from "./format";
import { buildRows, collectNights, type CalendarPayload, type NightMap } from "./parse";
import { SessionLostError } from "../_shared/errors";
import { chunk, mapPool } from "../_shared/pool";

/**
 * 마지막 지점을 끝낸 뒤 행을 조립해 반환하기까지 남겨두는 몫. `ctx.deadlineAt`은
 * `run.ts`가 검색을 자르는 시각이지 이 함수가 값을 돌려줘야 하는 시각이 아니다.
 */
const RETURN_RESERVE_MS = 2_000;

/** One property's calendar plus the span it actually covers. */
interface BranchCalendar {
  /** Inclusive, ISO. */
  from: string;
  to: string;
  nights: NightMap;
}

/** A booted booking-host session: who we are, and what we have already fetched. */
interface HanwhaSession {
  custNo: string;
  /** locCd → its calendar. Spans overlap heavily, so this is keyed by property. */
  calendars: Map<string, BranchCalendar>;
}

/**
 * Booted sessions, keyed by the page they belong to.
 *
 * `searchAvailability` runs once per hot window on the same `ctx.page`. Without
 * this every window would re-enter the booking host and re-fetch calendars it
 * already holds. A WeakMap rather than a module-level cache: the entry has to
 * die with the page, or a later crawl would inherit a `CUST_NO` from a browser
 * that no longer exists.
 */
const booted = new WeakMap<Page, HanwhaSession>();

export async function performSearch(
  ctx: CrawlerContext,
  params: SearchParams,
): Promise<InventoryRow[]> {
  const { log } = ctx;
  const startedAt = Date.now();
  const nights = Math.round(
    (params.checkout.getTime() - params.checkin.getTime()) / 86_400_000,
  );

  const branches = selectBranches(HANWHA.branches, params);
  if (branches.length === 0) {
    log("[hanwha] no branch to crawl", {
      branch: params.branch,
      excluded: params.excludeBranches?.length ?? 0,
    });
    return [];
  }

  const session = await bootSession(ctx);

  // 이 패스에 실제로 남은 시간. 상수(`passBudgetMs`)로 추정하면 두 시계가
  // 어긋난다 — 내부는 30초까지 달릴 권한이 있다고 믿는데, `run.ts`는 검색 전체를
  // `withDeadline`으로 감싸고 그 한계는 콜드 로그인 패스에서 20초대까지 내려간다.
  // 잘리면 `DeadlineExceeded`가 나고, 이 루프가 부분 반환으로 지키려던 **행 전부와
  // SUCCESS 판정이 함께 버려진다.** 정확한 값은 이미 `ctx.deadlineAt`으로 들어와
  // 있다(`resom/price.ts`가 쓰는 그 시계다). 상수는 이제 상한으로만 남는다.
  const budgetMs = Math.min(
    HANWHA.passBudgetMs,
    ctx.deadlineAt - startedAt - RETURN_RESERVE_MS,
  );
  if (budgetMs <= 0) {
    log("[hanwha] no budget left for this window, returning empty", {
      deadlineInMs: ctx.deadlineAt - startedAt,
    });
    return [];
  }

  const out: InventoryRow[] = [];
  const failures: string[] = [];
  let slowestBatchMs = 0;
  let attempted = 0;
  let truncated = false;
  let fetched = 0;
  let cached = 0;
  let sessionLosses = 0;

  // Properties go out in batches rather than one at a time. With sixteen of
  // them at roughly two seconds each, the serial loop spent ~32s on its first
  // window — over this pass's budget — so every cold pass truncated to a single
  // narrowed window worth ~120 rows and burned a whole browser launch doing it.
  // Batching removes the truncation instead of coping with it.
  //
  // The budget gate moves with it: it now sits between BATCHES and measures the
  // slowest batch, not the slowest property. Keeping a per-property yardstick
  // while dispatching four at once would under-count the wall clock by ~4× —
  // and over-running here does not cost this window, it costs everything the
  // pass has collected, because run.ts wraps the whole search in one deadline
  // and a `DeadlineExceeded` discards the lot.
  for (const group of chunk(branches, HANWHA.branchPool)) {
    const elapsed = Date.now() - startedAt;
    if (elapsed + slowestBatchMs > budgetMs) {
      truncated = true;
      log("[hanwha] budget exhausted, returning partial", {
        done: out.length,
        stoppedBefore: group[0].value,
        remaining: branches.length - attempted,
        elapsedMs: elapsed,
      });
      break;
    }
    const batchStart = Date.now();
    // Counted as attempted only once dispatched — a budget break leaves
    // properties untried, and untried is not failed (see the all-failed test
    // below, which is measured against this number).
    attempted += group.length;

    // Serially, a slow call could only ever overrun by its own length and the
    // gate above caught it before the next one started. In a batch there is no
    // "next one" to stop at: four are already in flight, and the batch is not
    // done until the slowest is. So the per-call timeout has to be the time
    // actually left, not the site-shaped 25s ceiling — a single straggler on
    // that ceiling would turn a partial return into a `DeadlineExceeded` and
    // take the whole pass's rows with it.
    const callTimeoutMs = Math.max(
      1_000,
      Math.min(HANWHA.timeouts.api, budgetMs - (Date.now() - startedAt)),
    );

    // `mapPool` never rejects; it reports per item. One property failing must
    // not cost the others, and that rule has to survive the move to concurrency.
    const settled = await mapPool(group, group.length, (branch) =>
      calendarFor(ctx, session, branch, params.checkin, nights, callTimeoutMs),
    );

    settled.forEach((r, i) => {
      const branch = group[i];
      if (!r.ok) {
        failures.push(branch.value);
        if (r.error instanceof SessionLostError) sessionLosses++;
        log("[hanwha] branch failed", {
          branch: branch.value,
          error: r.error instanceof Error ? r.error.message : String(r.error),
        });
        return;
      }
      if (r.value.hit) cached++;
      else fetched++;
      const rows = buildRows(r.value.nights, branch, { nights });
      out.push(...rows);
      log("[hanwha] branch done", {
        branch: branch.value,
        rows: rows.length,
        nights,
        source: r.value.hit ? "cache" : "fetch",
      });
    });

    slowestBatchMs = Math.max(slowestBatchMs, Date.now() - batchStart);
  }

  // All-failed must not read as "no availability": run.ts would record SUCCESS
  // with 0 rows, which looks exactly like a fully booked resort. Measured
  // against what was attempted, not the branch list — a budget break leaves
  // properties untried, and untried is not failed.
  if (attempted > 0 && failures.length === attempted) {
    // 어느 예외를 던지는지가 다음 패스를 정한다. 평범한 `Error`는 `run.ts`에게
    // 검색 실패로 읽혀 **죽은 storageState가 캐시에 그대로 남고**, 다음 시도의
    // `validateSession`이 그걸 통과시켜 로그인을 건너뛰고 같은 실패가 돌아온다
    // (`_shared/errors.ts`가 존재하는 이유 그대로다).
    //
    // 그리고 지점 전부가 한꺼번에 실패하는 것은 예약 호스트가 세션을 잃었을 때의
    // **전형적인 모양**이다 — 지점 16곳이 각자 사정으로 동시에 죽는 일은 드물다.
    // 그래서 실패가 전부 `SessionLostError`였다면 그 타입을 보존해서 던진다.
    // 하나라도 다른 이유였다면 세션 문제라고 단정하지 않는다.
    const detail = `모든 지점 조회 실패 (${failures.join(", ")})`;
    throw sessionLosses === failures.length
      ? new SessionLostError(detail)
      : new Error(`SEARCH_FAILED: ${detail}`);
  }

  log("[hanwha] window done", {
    rows: out.length,
    attempted,
    fetched,
    cached,
    failed: failures.length,
    truncated,
  });

  // A `stay` stamp is a claim that this call answered its whole span for
  // everything. run.ts reads it and skips every hot window those dates cover,
  // for the rest of the pass — so when the budget cut the property loop short,
  // keeping the stamps would retire the 1박 windows on behalf of properties
  // that were never reached. The loop order is fixed, so it would be the same
  // properties every pass: they would simply never be collected.
  //
  // The answer is to narrow this window to what it was actually asked about,
  // NOT to strip `stay`. Stripping it files all 46 check-in dates under the
  // requested window, where the upsert dedupe — keyed on branch+roomType+dates
  // — collapses them to one arbitrary date's status published as today's.
  // Measured: 4,922 rows became 107, each carrying some future day's answer.
  //
  // Dropping the surplus loses nothing permanently. The next window re-derives
  // it from `session.calendars` for free and stamps it in full, so the pass
  // self-heals within a couple of windows while every upsert stays true.
  //
  // Individual property failures do NOT trigger this. Those are idiosyncratic
  // and the next scheduled pass retries them, whereas narrowing every window
  // for one flaky property is a bad trade.
  if (truncated) {
    const wantCheckin = toIsoDate(params.checkin);
    const wantCheckout = toIsoDate(params.checkout);
    const narrowed = out.filter(
      (r) =>
        r.stay &&
        toIsoDate(r.stay.checkin) === wantCheckin &&
        toIsoDate(r.stay.checkout) === wantCheckout,
    );
    log("[hanwha] partial window narrowed to the requested stay", {
      collected: out.length,
      kept: narrowed.length,
    });
    return narrowed;
  }
  return out;
}

/**
 * One property's calendar, from cache when the cached span already answers.
 *
 * The response covers an arbitrary requested range literally, so a single
 * 45-day fetch from the first window's check-in contains every night the 30-day
 * hot window can ask about. Caching by span rather than by request is what turns
 * 60 windows × 16 properties into 16 calls.
 */
async function calendarFor(
  ctx: CrawlerContext,
  session: HanwhaSession,
  branch: HanwhaBranch,
  checkin: Date,
  nights: number,
  timeoutMs: number = HANWHA.timeouts.api,
): Promise<{ nights: NightMap; hit: boolean }> {
  const firstNight = toIsoDate(checkin);
  const lastNight = toIsoDate(addDaysUtc(checkin, Math.max(1, nights) - 1));

  const existing = session.calendars.get(branch.locCd);
  if (existing && existing.from <= firstNight && lastNight <= existing.to) {
    return { nights: existing.nights, hit: true };
  }

  const to = addDaysUtc(checkin, HANWHA.calendarSpanDays);
  const payload = await fetchCalendar(ctx, session.custNo, branch, checkin, to, timeoutMs);

  const map: NightMap = new Map();
  const { entities, dropped } = collectNights(payload, map);
  if (entities === 0) {
    // Not an error the site reports — a wrong BRCH_CD/LOC_CD pair answers
    // exactly this way, with HTTP 200 and no rows. Say so loudly; the silent
    // version is indistinguishable from a sold-out property.
    ctx.log("[hanwha] calendar returned no entities", {
      branch: branch.value,
      brchCd: branch.brchCd,
      locCd: branch.locCd,
    });
  } else if (dropped > 0) {
    ctx.log("[hanwha] calendar rows dropped", { branch: branch.value, dropped, entities });
  }

  const calendar: BranchCalendar = { from: toIsoDate(checkin), to: toIsoDate(to), nights: map };
  session.calendars.set(branch.locCd, calendar);
  return { nights: map, hit: false };
}

/**
 * One 잔여객실 조회 call.
 *
 * Exported so `scripts/debug-hanwha.ts` can re-measure the two properties this
 * crawler's request count depends on — how many days one call covers, and
 * whether the stay length changes anything — without a second copy of the
 * request shape sitting next to it, where the two could drift apart.
 */
export async function fetchCalendar(
  ctx: CrawlerContext,
  custNo: string,
  branch: HanwhaBranch,
  from: Date,
  to: Date,
  timeoutMs: number = HANWHA.timeouts.api,
): Promise<CalendarPayload> {
  const ds = {
    ds_search: [
      {
        ...HANWHA.request,
        BRCH_CD: branch.brchCd,
        LOC_CD: branch.locCd,
        CUST_NO: custNo,
        STRT_DATE: formatDateCompact(from),
        END_DATE: formatDateCompact(to),
      },
    ],
    serviceInfo: HANWHA.calendarService,
  };

  const res = await ctx.page.request.post(HANWHA.calendarUrl, {
    timeout: timeoutMs,
    headers: { Referer: HANWHA.bookingUrl },
    // The gateway takes a urlencoded `ds` field, not a JSON body.
    form: { ds: JSON.stringify(ds) },
  });
  if (!res.ok()) {
    throw new Error(`doExecute ${res.status()} (${branch.value})`);
  }

  const payload = (await res.json()) as CalendarPayload;
  // HTTP 200 is not success here: the gateway reports service errors inside the
  // envelope, and an absent `ds_result` means the service refused rather than
  // that the property is empty.
  if (!payload.ds?.Data?.ds_result) {
    const msg = payload.ds?.MessageHeader?.MSG_TXT ?? "ds_result 없음";
    throw new Error(`doExecute 서비스 오류 (${branch.value}): ${msg}`);
  }
  return payload;
}

/**
 * Make the booking host recognise us, and learn who we are.
 *
 * The two hosts are separate JEUS applications. A logged-in `www` session does
 * NOT carry over on its own: navigating straight to the availability screen
 * leaves `sCustNo` empty and the calendar answers with the anonymous view,
 * which is not an error and not obviously wrong — just 회원우선 everywhere
 * instead of 예약가능. Loading one of the booking host's own pages first is what
 * mints its session.
 *
 * `CUST_NO` is read here rather than pinned in config because it is per-account
 * — the same reason SONO re-reads its `memNo` every pass.
 *
 * **`index.ts`의 `validateSession`도 이것을 부른다.** 검사하는 호스트(`www`)와
 * 세션을 잃는 호스트(`booking`)가 달라서, `sessionCheck.do` 통과가 크롤 가능을
 * 뜻하지 않기 때문이다. 공짜인 이유는 `booted`가 `ctx.page`로 키잉된 WeakMap이라
 * 검증에서 부팅한 결과를 같은 패스의 `performSearch`가 그대로 재사용한다는 것 —
 * 네비게이션이 **늘지 않고 앞당겨질 뿐**이다.
 */
export async function bootSession(
  ctx: CrawlerContext,
  timeoutMs: number = HANWHA.timeouts.navigation,
): Promise<HanwhaSession> {
  const { page, log } = ctx;
  const existing = booted.get(page);
  if (existing) return existing;

  log("[hanwha] booting booking host session");
  await page.goto(HANWHA.entranceUrl, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });

  const custNo = await page
    .evaluate<string>("typeof sCustNo !== 'undefined' ? String(sCustNo) : ''")
    .catch(() => "");

  if (!custNo) {
    // Returning zero rows here would be recorded as SUCCESS and read as a
    // resort with nothing available, so this has to throw.
    throw new SessionLostError(`예약 호스트가 회원을 인식하지 못함. url=${page.url()}`);
  }

  // Don't log the number itself — it identifies the corporate account.
  log("[hanwha] booking host session ready", { custNoChars: custNo.length });
  const session: HanwhaSession = { custNo, calendars: new Map() };
  booted.set(page, session);
  return session;
}
