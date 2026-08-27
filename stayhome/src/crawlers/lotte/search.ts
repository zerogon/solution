import { mapPool } from "../_shared/pool";
import type { CrawlerContext, InventoryRow, SearchParams } from "../types";
import { LOTTE, type LotteBranch } from "./config";
import { formatDateCompact } from "./format";
import { parseRoomList, type RoomListPayload } from "./parse";

/**
 * Query availability for every branch via the reservation JSON API. The call
 * goes through `page.request` so the logged-in session cookies ride along
 * (member rates / member-only rooms where applicable) — no DOM interaction.
 */
export async function performSearch(
  ctx: CrawlerContext,
  params: SearchParams,
): Promise<InventoryRow[]> {
  const { log } = ctx;
  const checkinDt = formatDateCompact(params.checkin);
  const checkoutDt = formatDateCompact(params.checkout);
  // 요금이 총액이 되려면 박수가 필요하다. 롯데는 행에 `stay`를 붙이지 않으므로
  // (요청한 윈도우 = 그 행의 숙박) 이 값이 그대로 그 행의 밤 수다.
  const nights = Math.round(
    (params.checkout.getTime() - params.checkin.getTime()) / 86_400_000,
  );

  const branches = params.branch
    ? LOTTE.branches.filter((b) => b.value === params.branch)
    : LOTTE.branches;

  // The four branches are independent JSON GETs to one host with no shared
  // state, so they go out together instead of end to end. This is the whole
  // reason LOTTE now finishes its 60 hot windows in about two passes rather
  // than five, and a pass is a browser launch on the warm instance all five
  // resorts share — see `_shared/pool.ts`.
  //
  // There is no budget gate to interact with here: unlike HANWHA and OAKVALLEY
  // this crawler never reads `ctx.deadlineAt`, and relies entirely on the
  // `withDeadline` that `run.ts` wraps the whole search in.
  const settled = await mapPool(branches, LOTTE.branchPool, (branch) =>
    searchOneBranch(ctx, branch, checkinDt, checkoutDt, nights),
  );

  const out: InventoryRow[] = [];
  const failures: string[] = [];
  settled.forEach((r, i) => {
    const branch = branches[i];
    if (r.ok) {
      log("[lotte] branch done", { branch: branch.label, rows: r.value.length });
      out.push(...r.value);
      return;
    }
    failures.push(branch.label);
    // One branch failing (API hiccup, temporary closure) shouldn't kill the
    // whole crawl — log and continue.
    //
    // ⚠️ Swallowing here is load-bearing beyond this function: `removeVanishedRows`
    // treats a (branch, checkin, checkout) group with zero rows as "not answered"
    // and leaves it alone. A failed branch producing no rows is exactly that,
    // and turning these into a throw — or into empty placeholder rows — would
    // publish a crawl failure as "every room sold out".
    log("[lotte] branch failed, continuing", {
      branch: branch.label,
      error: r.error instanceof Error ? r.error.message : String(r.error),
    });
  });

  // 삼키는 것은 **한 지점**까지다. 전부 실패하면 `run.ts`가 0행 SUCCESS로 기록하고,
  // 그건 "이 리조트는 그날 전 객실 매진"과 글자 하나 다르지 않다. 조회 화면은
  // 그 둘을 구별할 방법이 없고, 이제 백스톱도 재고를 근거로 판정하므로 이 거짓
  // 성공은 "고칠 필요 없음"으로까지 읽힌다.
  if (branches.length > 0 && failures.length === branches.length) {
    throw new Error(`SEARCH_FAILED: 모든 지점 조회 실패 (${failures.join(", ")})`);
  }
  return out;
}

async function searchOneBranch(
  ctx: CrawlerContext,
  branch: LotteBranch,
  checkinDt: string,
  checkoutDt: string,
  nights: number,
): Promise<InventoryRow[]> {
  const { page, log } = ctx;

  log("[lotte] roomList API call", { branch: branch.label, checkinDt, checkoutDt });
  const res = await page.request.get(LOTTE.roomListApiUrl, {
    params: {
      rsvType: "BAR",
      procType: "",
      bizCd: branch.bizCd,
      checkinDt,
      checkoutDt,
      roomCnt: "1",
    },
    headers: {
      Accept: "application/json",
      Referer: `${LOTTE.bookingUrl}?bizCd=${branch.bizCd}`,
    },
    timeout: LOTTE.timeouts.api,
  });
  if (!res.ok()) {
    throw new Error(`roomList API HTTP ${res.status()} (bizCd=${branch.bizCd})`);
  }

  const payload = (await res.json()) as RoomListPayload;
  if (!payload.roomList?.length) {
    log("[lotte] roomList empty", {
      branch: branch.label,
      rsltCd: payload.rsltCd,
      rsltMsg: payload.rsltMsg,
    });
  }
  return parseRoomList(payload, branch, { checkinDt, checkoutDt, nights });
}
