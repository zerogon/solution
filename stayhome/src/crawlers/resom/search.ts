import { addDaysUtc, toIsoDate } from "@/lib/utils";
import type { CrawlerContext, InventoryRow, SearchParams } from "../types";
import { RESOM, type ResomBranch } from "./config";
import { formatDateCompact } from "./format";
import { authHeaders, fetchMember, readAuth } from "./login";
import { attachPrices } from "./price";
import { parseCalendar, type CalendarPayload } from "./parse";

/** `GET {apiBase}/roomReservation/allCondos` — the room-type catalog. */
interface AllCondosResponse {
  condoCd?: string;
  condoNm?: string;
  bizNm?: string;
  roomTypeList?: Array<{ rmTypeCd?: string }>;
}

/**
 * Query availability via the member-reservation JSON API.
 *
 * One request per property covers the whole hot window, which is the shape the
 * API happens to offer: `calendarRooms` is keyed by check-in date and honours
 * an arbitrary `ciYmd`..`coYmd` range (measured across a month boundary, 53
 * consecutive days, no gaps). So this loops over three properties rather than
 * over dates, and the rows come back stamped with their own `stay` so `run.ts`
 * skips every later window they already answered.
 *
 * The room-type codes are a required parameter — an empty `rmTypeCd` list is a
 * 400 — and they come from `allCondos` rather than from config. Room types
 * churn (new 동, renovated 평형) in a way property names do not, and unlike
 * `branchName` they are not a key anything else has to agree on.
 */
export async function performSearch(
  ctx: CrawlerContext,
  params: SearchParams,
): Promise<InventoryRow[]> {
  const { log } = ctx;
  const nights = Math.round(
    (params.checkout.getTime() - params.checkin.getTime()) / 86_400_000,
  );

  const branches = params.branch
    ? RESOM.branches.filter((b) => b.value === params.branch)
    : RESOM.branches;
  if (branches.length === 0) {
    log("[resom] no matching branch", { branch: params.branch });
    return [];
  }

  const roomTypes = await fetchRoomTypes(ctx);

  // 요금을 붙여도 되는 상황인가. 두 번 판정한다 — 라우트는 "사람이 지점 하나를
  // 지목해 눌렀다"를 알고(`params.withPrices`), 여기는 그 요금이 실제로 얼마나
  // 비싼지를 안다. 어긋나면 증상이 항상 "요금이 안 나옴"(안전)이고 "예산 초과"
  // (재고 행 전멸)가 될 수 없다.
  const wantsPrices = params.withPrices === true && branches.length === 1;

  const out: InventoryRow[] = [];
  const failures: string[] = [];
  for (const branch of branches) {
    const codes = roomTypes.get(branch.condoCd) ?? [];
    if (codes.length === 0) {
      // Not an error we can retry past: without codes the API rejects the
      // call, and a property missing from allCondos is a catalog question.
      log("[resom] no room types for branch", { branch: branch.value });
      failures.push(branch.value);
      continue;
    }
    try {
      const payload = await fetchCalendar(ctx, branch, codes, {
        checkin: params.checkin,
        nights,
      });
      const rows = parseCalendar(payload, branch, { nights });
      const dates = new Set(rows.map((r) => (r.stay ? toIsoDate(r.stay.checkin) : "")));
      log("[resom] branch done", {
        branch: branch.value,
        rows: rows.length,
        checkinDates: dates.size,
      });

      if (wantsPrices) {
        // 두 겹으로 감싼다. `attachPrices`가 내부에서 전부 삼키지만, 예상 못 한
        // 예외 하나(엔트리 모양이 바뀌어 생긴 TypeError 같은 것)가 여기까지 새면
        // `withDeadline`이 아니라 그냥 예외로 이 지점 45일치 행이 전멸한다.
        // 지점 루프가 예외를 삼키는 것과 같은 판단이다(아래 catch 주석).
        try {
          const auth = await readAuth(ctx);
          const member = await fetchMember(ctx);
          if (auth && member) {
            await attachPrices(ctx, {
              payload,
              rows,
              branch,
              checkin: params.checkin,
              nights,
              auth,
              member,
            });
          }
        } catch (e) {
          log("[resom] price pass failed, inventory kept", {
            branch: branch.value,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      out.push(...rows);
    } catch (e) {
      // One property failing must not cost the others: run.ts wraps the whole
      // search in a single deadline, so throwing here would discard everything
      // collected so far in this window.
      failures.push(branch.value);
      log("[resom] branch failed", {
        branch: branch.value,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // All-failed must not read as "no availability". run.ts would otherwise
  // record SUCCESS with 0 rows, which looks exactly like a fully booked resort.
  if (failures.length === branches.length) {
    throw new Error(`SEARCH_FAILED: 모든 지점 조회 실패 (${failures.join(", ")})`);
  }
  return out;
}

/** condoCd → its room-type codes, as `calendarRooms` requires them. */
async function fetchRoomTypes(ctx: CrawlerContext): Promise<Map<string, string[]>> {
  const auth = await readAuth(ctx);
  if (!auth) throw new Error("SESSION_LOST: 저장된 토큰이 없음");

  const res = await ctx.page.request.get(`${RESOM.apiBase}/roomReservation/allCondos`, {
    timeout: RESOM.timeouts.api,
    headers: authHeaders(auth),
  });
  if (!res.ok()) {
    throw new Error(`allCondos ${res.status()}`);
  }
  const body = (await res.json()) as AllCondosResponse[];
  const map = new Map<string, string[]>();
  for (const condo of body ?? []) {
    if (!condo.condoCd) continue;
    const codes = (condo.roomTypeList ?? [])
      .map((r) => r.rmTypeCd)
      .filter((c): c is string => Boolean(c));
    map.set(condo.condoCd, [...new Set(codes)]);
  }
  return map;
}

/**
 * One property's calendar. Exported so `scripts/debug-resom.ts span` can
 * re-measure the two properties this crawler's request count depends on — how
 * many days one call covers, and whether `nights` changes anything — without
 * reproducing the request shape next to it, where the two could drift apart.
 */
export async function fetchCalendar(
  ctx: CrawlerContext,
  branch: ResomBranch,
  roomTypeCodes: readonly string[],
  opts: { checkin: Date; nights: number },
): Promise<CalendarPayload> {
  const auth = await readAuth(ctx);
  if (!auth) throw new Error("SESSION_LOST: 저장된 토큰이 없음");
  const member = await fetchMember(ctx);
  if (!member) throw new Error("SESSION_LOST: auth/info가 회원번호를 주지 않음");

  const query = new URLSearchParams({
    memNo: member.memNo,
    memInd: member.memInd,
    condoCd: branch.condoCd,
    ciYmd: formatDateCompact(opts.checkin),
    coYmd: formatDateCompact(addDaysUtc(opts.checkin, RESOM.calendarSpanDays)),
    nights: String(opts.nights),
    rmCnt: String(RESOM.roomCount),
  });
  // Repeated key, not a comma list — the SPA's serializer emits it this way and
  // a comma list comes back 400.
  for (const code of roomTypeCodes) query.append("rmTypeCd", code);

  const res = await ctx.page.request.get(
    `${RESOM.apiBase}/roomReservation/calendarRooms?${query.toString()}`,
    { timeout: RESOM.timeouts.api, headers: authHeaders(auth) },
  );
  if (!res.ok()) {
    throw new Error(`calendarRooms ${res.status()} (${branch.value})`);
  }
  return (await res.json()) as CalendarPayload;
}
