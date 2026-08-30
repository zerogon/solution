import type { Page } from "playwright-core";
import { selectBranches } from "../_shared/branches";
import type { CrawlerContext, InventoryRow, SearchParams } from "../types";
import { OAKVALLEY } from "./config";
import { monthScopeKey, monthsCovering } from "./format";
import { buildRows, collectNights, type CalendarPayload, type NightMap } from "./parse";
import { loadRateBook } from "./rates";
import { SessionLostError } from "../_shared/errors";

/**
 * 마지막 지점을 끝낸 뒤 행을 조립해 반환하기까지 남겨두는 몫. `ctx.deadlineAt`은
 * `run.ts`가 검색을 자르는 시각이지 이 함수가 값을 돌려줘야 하는 시각이 아니다.
 */
const RETURN_RESERVE_MS = 2_000;

/** One harvested form field. `id` and `name` differ on this page — see below. */
interface Field {
  name: string;
  id: string;
  value: string;
}

/**
 * A booted condo page: the calendar form's fields (including `ptSignature`) and
 * the calendars already fetched during this pass.
 */
interface CondoSession {
  fields: Field[];
  /** `${complexCd}|${YYYY-MM}` → payload, so the 1박 and 2박 passes share fetches. */
  calendars: Map<string, CalendarPayload>;
}

/**
 * Booted sessions, keyed by the page they belong to.
 *
 * `searchAvailability` is called once per hot window on the same `ctx.page`, so
 * without this the 2박 pass would repeat the 1박 pass's navigation and requests
 * verbatim. A WeakMap rather than a module-level cache: the entry has to die
 * with the page, or a later crawl would inherit a stale `ptSignature` from a
 * browser that no longer exists.
 */
const booted = new WeakMap<Page, CondoSession>();

export async function performSearch(
  ctx: CrawlerContext,
  params: SearchParams,
): Promise<InventoryRow[]> {
  const { log } = ctx;
  const startedAt = Date.now();
  const nights = Math.round(
    (params.checkout.getTime() - params.checkin.getTime()) / 86_400_000,
  );

  const branches = selectBranches(OAKVALLEY.branches, params);
  if (branches.length === 0) {
    log("[oakvalley] no branch to crawl", {
      branch: params.branch,
      excluded: params.excludeBranches?.length ?? 0,
    });
    return [];
  }

  const session = await bootCondo(ctx);
  // 패스당 한 번. 공개 API 한 번이라 비용이 O(1)이고, 리솜처럼 행마다 콜이 아니므로
  // `withPrices` 게이트를 타지 않는다 — 그 게이트가 재는 것은 비용이다.
  const rates = await loadRateBook(ctx);
  const months = monthsCovering(params.checkin, OAKVALLEY.calendarMonths);

  // 이 패스에 실제로 남은 시간. 상수(`passBudgetMs`)로 추정하면 두 시계가
  // 어긋난다 — 내부는 30초까지 달릴 권한이 있다고 믿는데, `run.ts`는 검색 전체를
  // `withDeadline`으로 감싸고 그 한계는 콜드 로그인 패스에서 20초대까지 내려간다.
  // 잘리면 `DeadlineExceeded`가 나고, 이 루프가 부분 반환으로 지키려던 **행 전부와
  // SUCCESS 판정이 함께 버려진다.** 정확한 값은 이미 `ctx.deadlineAt`으로 들어와
  // 있다(`resom/price.ts`가 쓰는 그 시계다). 상수는 이제 상한으로만 남는다.
  const budgetMs = Math.min(
    OAKVALLEY.passBudgetMs,
    ctx.deadlineAt - startedAt - RETURN_RESERVE_MS,
  );
  if (budgetMs <= 0) {
    log("[oakvalley] no budget left for this window, returning empty", {
      deadlineInMs: ctx.deadlineAt - startedAt,
    });
    return [];
  }

  const out: InventoryRow[] = [];
  const failures: string[] = [];
  let slowestUnitMs = 0;
  let attempted = 0;

  for (const branch of branches) {
    // Budget checked between units, and against the SLOWEST unit seen rather
    // than the mean — the same rule run.ts applies to its window loop. Breaking
    // out with partial rows is the whole point: run.ts wraps this entire
    // function in one deadline, so throwing here would discard every row already
    // collected for the other branch.
    const elapsed = Date.now() - startedAt;
    if (elapsed + slowestUnitMs > budgetMs) {
      log("[oakvalley] budget exhausted, returning partial", {
        done: out.length,
        stoppedBefore: branch.value,
        elapsedMs: elapsed,
      });
      break;
    }
    const unitStart = Date.now();
    attempted++;

    try {
      const map: NightMap = new Map();
      let fetched = 0;
      let cached = 0;
      for (const scope of months) {
        const key = `${branch.complexCd}|${monthScopeKey(scope.year, scope.month)}`;
        let payload = session.calendars.get(key);
        if (payload) {
          cached++;
        } else {
          payload = await fetchCalendar(ctx, session, { complexCd: branch.complexCd, ...scope });
          session.calendars.set(key, payload);
          fetched++;
        }
        collectNights(payload, scope, map);
      }

      const rows = buildRows(map, branch, { nights }, rates);
      out.push(...rows);
      log("[oakvalley] branch done", {
        branch: branch.value,
        rows: rows.length,
        nights,
        months: months.length,
        fetched,
        cached,
      });
    } catch (e) {
      // One village failing must not cost the other.
      failures.push(branch.value);
      log("[oakvalley] branch failed", {
        branch: branch.value,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    slowestUnitMs = Math.max(slowestUnitMs, Date.now() - unitStart);
  }

  // All-failed must not read as "no availability": run.ts would record SUCCESS
  // with 0 rows, which looks exactly like a fully booked resort. Measured
  // against what was actually attempted, not against the branch list — a
  // budget break leaves branches untried, and untried is not failed.
  if (attempted > 0 && failures.length === attempted) {
    throw new Error(`SEARCH_FAILED: 모든 지점 조회 실패 (${failures.join(", ")})`);
  }
  return out;
}

/**
 * Load the 회원 콘도 예약 page and harvest the calendar form.
 *
 * `p_entrance.jsp` is a dispatcher: it POSTs a `condo_flag` to `c_100.jsp`
 * (CONDO / coupon / package / season all land there; GRP1/GRP2 go to the golf
 * package page). We only ever send CONDO.
 *
 * The POST is synthesized rather than clicked. The entrance page's only visible
 * control is 로그아웃 — the real navigation is a hidden `#frm_condo` submitted by
 * script, so there is no button to press, and building the two-field form is
 * both shorter and less fragile than reverse-engineering the binding.
 */
async function bootCondo(ctx: CrawlerContext): Promise<CondoSession> {
  const { page, log } = ctx;
  const existing = booted.get(page);
  if (existing) return existing;

  // Armed once per page. The JSP app uses native alert() liberally; an
  // unhandled dialog blocks every later navigation and evaluate *forever*, and
  // the symptom is a step that produces nothing — which reads like a network
  // stall rather than a modal. The text is worth keeping: "회원권을 선택한 후
  // 진행해 주십시오" would otherwise be the unexplained cause of an empty answer.
  page.on("dialog", async (d) => {
    log("[oakvalley] dialog", { type: d.type(), message: d.message().slice(0, 120) });
    await d.accept().catch(() => undefined);
  });

  await page.goto(OAKVALLEY.entranceUrl, {
    waitUntil: "domcontentloaded",
    timeout: OAKVALLEY.timeouts.navigation,
  });
  await page.evaluate(
    ({ action, flag }) => {
      const f = document.createElement("form");
      f.method = "POST";
      f.action = action;
      const i = document.createElement("input");
      i.type = "hidden";
      i.name = "condo_flag";
      i.value = flag;
      f.appendChild(i);
      document.body.appendChild(f);
      f.submit();
    },
    { action: OAKVALLEY.condoUrl, flag: OAKVALLEY.condoFlag },
  );
  await page
    .waitForURL(/c_100\.jsp/, { timeout: OAKVALLEY.timeouts.boot })
    .catch(() => undefined);

  const fields = await page.evaluate((sel) => {
    const form = document.querySelector(sel) as HTMLFormElement | null;
    if (!form) return null;
    return [...form.elements]
      .map((el) => ({
        name: el.getAttribute("name") ?? "",
        id: el.getAttribute("id") ?? "",
        value: (el as HTMLInputElement).value ?? "",
      }))
      .filter((f) => f.name);
  }, OAKVALLEY.calendarFormSelector);

  if (!fields || fields.length === 0) {
    // Landing anywhere but the condo page means the JSP session is gone (the
    // app bounces to login), not that the calendar is empty.
    throw new SessionLostError(`콘도 예약 화면을 열지 못함. url=${page.url()}`);
  }

  const session: CondoSession = { fields, calendars: new Map() };
  booted.set(page, session);
  log("[oakvalley] condo page booted", { fields: fields.length });
  return session;
}

/**
 * The fields one query changes, keyed by element **id**.
 *
 * Not by name, and the distinction cost a measurement: the month field is
 * `id="V_T_MONTH" name="T_MONTH"`. Overriding the name left the id alone, the
 * form went on submitting the month it was rendered with, and the calendar
 * answered that month for every request — as `success:true`, with no error
 * anywhere. `c_handler.js`'s own `resetDate()` sets all three of `V_IN_YEAR`,
 * `V_IN_MONTH` and `V_T_MONTH`, so this does too.
 *
 * The 회원권 fields are deliberately absent: measured across five certificates
 * and no certificate at all, the calendar was identical every time.
 */
function overridesById(q: { complexCd: string; year: number; month: number }) {
  const mm = String(q.month).padStart(2, "0");
  return {
    V_IN_COMPLEX: q.complexCd,
    V_IN_YEAR: String(q.year),
    V_IN_MONTH: mm,
    V_T_MONTH: `${q.year}${mm}`,
  } as Record<string, string>;
}

/**
 * One village-month of availability.
 *
 * Exported so `scripts/debug-oakvalley.ts span` can re-measure the two things
 * this crawler's request count depends on — how much one call covers, and
 * whether 박수 changes anything — without reproducing the request shape next to
 * it, where the two could drift apart.
 */
export async function fetchCalendar(
  ctx: CrawlerContext,
  session: CondoSession,
  q: { complexCd: string; year: number; month: number },
): Promise<CalendarPayload> {
  const byId = overridesById(q);
  const body: Record<string, string> = {};
  for (const f of session.fields) {
    body[f.name] = f.id in byId ? byId[f.id] : f.value;
  }

  const res = await ctx.page.request.post(OAKVALLEY.calendarUrl, {
    timeout: OAKVALLEY.timeouts.api,
    headers: { Referer: OAKVALLEY.condoUrl, "X-Requested-With": "XMLHttpRequest" },
    form: body,
  });
  if (!res.ok()) {
    throw new Error(
      `getCalendar ${res.status()} (${q.complexCd} ${monthScopeKey(q.year, q.month)})`,
    );
  }
  const payload = (await res.json()) as CalendarPayload;
  // HTTP 200 with success:false is how this app reports a rejected request.
  if (payload.success === false || payload.success === "false") {
    throw new Error(
      `getCalendar rejected: ${payload.errMsg || payload.message || "(no message)"}`,
    );
  }
  return payload;
}
