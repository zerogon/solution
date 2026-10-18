import { toIsoDate } from "@/lib/utils";
import { selectBranches } from "../_shared/branches";
import { SessionLostError } from "../_shared/errors";
import type { CrawlerContext, InventoryRow, SearchParams } from "../types";
import { KENSINGTON, type KensingtonBranch } from "./config";
import { memberNo } from "./member";
import { attachOccupancy } from "./occupancy";
import { buildRows, parseRoomFragment, type KensingtonRow } from "./parse";
import { attachPrices } from "./price";

/**
 * 분양회원 경로로 지점마다 객실 목록 한 콜.
 *
 * **지점을 순차로 묻는다 — 이 저장소의 "지점이 여럿이면 병렬" 규칙의 예외다.**
 * 2026-10-18 실측(같은 세션, 10지점 × 3회): 병렬 10은 윈도우당 6.8~9.7초에 307이 0·1·3건,
 * 병렬 5는 7.8~9.5초에 1건, **순차는 5.4~7.5초에 0건**이었다. 서버가 한 세션의 요청을 하나씩
 * 처리하는 것으로 보이고(세션 잠금), 병렬은 빨라지지 않고 가짜 "세션 상실"(307 →
 * `/reservation/search`)만 만든다 — 첫 실크롤에서 지리산남원 하나가 그렇게 빠졌다.
 *
 * 순차라서 예산 게이트를 **지점 사이**에 둔다(한화의 배치 사이 게이트와 같은 자리).
 * 다음 지점이 지금까지 가장 느린 콜만큼 걸려도 `ctx.deadlineAt` 안에 끝날 때만 묻는다 —
 * 넘기면 `run.ts`의 `withDeadline`이 터지고, 그러면 잃는 것은 그 지점이 아니라 이 윈도우의
 * 행 전부다. 게이트에 걸려 못 물은 지점은 0행이고, 0행 그룹은 `removeVanishedRows`가
 * 건드리지 않는다. 실제로는 `run.ts`가 가장 느린 윈도우가 들어갈 때만 윈도우를 시작하므로
 * 이 게이트는 거의 열리지 않는다.
 *
 * 지점마다 재고 뒤에 인원(`occupancy.ts`)과 요금(`price.ts`, 지점 하나를 지목한 최신화에서만)을
 * 붙인다. 둘 다 실패해도 재고 행은 남는다. **인원은 기다리지 않고 다음 지점으로 넘어간다** —
 * 쿠키 없는 콜이라 이 순차 줄 밖에서 돌고, 윈도우 끝에서 한 번 모아 기다린다. 지점마다 기다리면
 * 캐시가 빈 첫 윈도우가 ~10초 느려지고, `run.ts`가 그 느린 윈도우를 척도로 삼아 패스당 윈도우가
 * 6 → 3으로 줄었다(2026-10-18 실측).
 */
export async function performSearch(
  ctx: CrawlerContext,
  params: SearchParams,
): Promise<InventoryRow[]> {
  const { log } = ctx;
  const branches = selectBranches(KENSINGTON.branches, params);
  if (branches.length === 0) {
    // 이유를 말하지 않는 0행 윈도우는 "그날 전 객실 매진"과 구별되지 않는다.
    log("[kensington] no branch to crawl", {
      branch: params.branch,
      excluded: params.excludeBranches?.length ?? 0,
    });
    return [];
  }

  const membNo = await memberNo(ctx);
  const checkin = toIsoDate(params.checkin);
  const checkout = toIsoDate(params.checkout);
  // 요금을 붙여도 되는 상황인가 — 리솜·소노와 같은 두 번 판정. 라우트는 "사람이 지점
  // 하나를 지목했다"를 알고(`withPrices`), 여기는 그 비용(방마다 순차 1콜)을 안다.
  const wantsPrices = params.withPrices === true && branches.length === 1;

  const out: InventoryRow[] = [];
  const failures: string[] = [];
  let attempted = 0;
  let sessionLosses = 0;
  let slowestMs = 0;
  const occupancyPending: Promise<void>[] = [];
  for (const branch of branches) {
    const left = ctx.deadlineAt - Date.now() - KENSINGTON.timeouts.returnReserve;
    if (left < Math.max(slowestMs, 1_000)) {
      log("[kensington] budget exhausted, returning partial window", {
        checkin,
        stoppedBefore: branch.value,
        remaining: branches.length - attempted,
      });
      break;
    }
    attempted++;
    const startedAt = Date.now();
    try {
      const rows = await searchOneBranch(ctx, branch, checkin, checkout, membNo);
      // 행 객체를 먼저 내보내고 인원은 나중에 채운다 — 반환 전에 아래에서 기다린다.
      out.push(...rows.map((r) => r.row));
      occupancyPending.push(attachOccupancySafely(ctx, branch, rows));
      if (wantsPrices) await attachPricesSafely(ctx, branch, rows, { checkin, checkout, membNo });
    } catch (e) {
      failures.push(branch.value);
      if (e instanceof SessionLostError) sessionLosses++;
      // ⚠️ 삼키는 것이 이 함수 밖에서도 하중을 받는다: 실패한 지점은 0행이 되고,
      // `removeVanishedRows`는 0행 그룹을 건드리지 않는다. 빈 자리표시 행을 만들거나
      // 여기서 던지면 크롤 실패가 "전 객실 매진"으로 발행된다.
      log("[kensington] branch failed, continuing", {
        branch: branch.value,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    slowestMs = Math.max(slowestMs, Date.now() - startedAt);
  }

  await Promise.all(occupancyPending);

  // 삼키는 것은 일부 지점까지다. 전부 실패한 0행 SUCCESS는 "전 객실 매진"과 구별되지 않는다.
  // 전부가 세션 상실이면 그렇게 던져야 `run.ts`가 패스 안에서 재로그인한다.
  if (attempted > 0 && failures.length === attempted) {
    const detail = `모든 지점 조회 실패 (${failures.join(", ")})`;
    throw sessionLosses === failures.length
      ? new SessionLostError(detail)
      : new Error(`SEARCH_FAILED: ${detail}`);
  }

  log("[kensington] window done", {
    checkin,
    checkout,
    rows: out.length,
    attempted,
    failed: failures.length,
    slowestMs,
  });
  return out;
}

/**
 * 인원·요금을 붙이는 호출을 한 겹 더 감싼다 — 각 함수가 안에서 전부 삼키지만, 예상 못 한
 * 예외 하나가 새면 요금은 지점 루프의 catch가 받아 **이 지점의 재고 행이 전멸**하고, 인원은
 * `Promise.all`을 터뜨려 **윈도우 전체**를 잃는다(리솜 `attachPrices` 호출부와 같은 판단).
 */
async function attachOccupancySafely(
  ctx: CrawlerContext,
  branch: KensingtonBranch,
  rows: KensingtonRow[],
): Promise<void> {
  if (rows.length === 0) return;
  try {
    await attachOccupancy(ctx, branch, rows);
  } catch (e) {
    ctx.log("[kensington] occupancy pass failed, inventory kept", {
      branch: branch.value,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function attachPricesSafely(
  ctx: CrawlerContext,
  branch: KensingtonBranch,
  rows: KensingtonRow[],
  stay: { checkin: string; checkout: string; membNo: string },
): Promise<void> {
  if (rows.length === 0) return;
  try {
    await attachPrices(ctx, branch, rows, stay);
  } catch (e) {
    ctx.log("[kensington] price pass failed, inventory kept", {
      branch: branch.value,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function searchOneBranch(
  ctx: CrawlerContext,
  branch: KensingtonBranch,
  checkin: string,
  checkout: string,
  membNo: string,
): Promise<KensingtonRow[]> {
  // 사이트의 `#fm_search` 직렬화 그대로. 빈 칸들도 보낸다 — 이 서버는 칸이 빠지면
  // "잘못된 접근"(`N`)으로 답하는 화면이 있어, 무엇이 필수인지 가려 보는 것보다 사이트와
  // 같은 요청을 보내는 쪽이 싸다.
  const res = await ctx.page.request.get(KENSINGTON.roomListUrl, {
    params: {
      search_bran_cd: branch.branCd,
      search_stay_start_dt: checkin,
      search_stay_end_dt: checkout,
      search_room_cnt: "1",
      search_people_adult_cnt: "2",
      search_people_adult_cnts: "2",
      search_people_child_cnt: "0",
      search_people_child_cnts: "0",
      search_code_type: "",
      search_code: "",
      pack_cd: "",
      room_type_cd: "",
      memb_no: membNo,
      pay_type: KENSINGTON.payType,
    },
    headers: {
      Referer: KENSINGTON.memberPageUrl,
      "X-Requested-With": "XMLHttpRequest",
    },
    // 익명이면 307 → `/reservation/search`. 따라가면 그 페이지의 HTML을 "객실 0개"로 읽는다.
    maxRedirects: 0,
    timeout: callTimeout(ctx),
  });
  const status = res.status();
  if (status >= 300 && status < 400) {
    throw new SessionLostError(`quick_roomdata_member ${status} → ${res.headers()["location"] ?? "?"}`);
  }
  if (!res.ok()) throw new Error(`quick_roomdata_member HTTP ${status} (${branch.branCd})`);

  const html = await res.text();
  if (html.trim() === "N") {
    // 사이트의 "잘못된 접근 입니다." — 요청 모양이 틀렸다는 뜻이지 매진이 아니다.
    throw new Error(`quick_roomdata_member rejected the request (${branch.branCd})`);
  }
  return buildRows(parseRoomFragment(html), branch);
}

/**
 * 이 콜이 쓸 수 있는 시간. 상수가 아니라 **남은 예산에서 유도한다** — 게이트를 통과한
 * 뒤에도 이 콜이 유독 느리면 상한(`timeouts.api`)이 남은 예산을 넘길 수 있고, 그러면
 * 부분 반환이 `DeadlineExceeded`가 되어 그 윈도우의 행 전부를 잃는다. 시간이 모자라 죽은
 * 콜은 그 지점만 0행이 된다(안전한 실패).
 */
function callTimeout(ctx: CrawlerContext): number {
  const remaining = ctx.deadlineAt - Date.now() - KENSINGTON.timeouts.returnReserve;
  return Math.max(1_000, Math.min(KENSINGTON.timeouts.api, remaining));
}
