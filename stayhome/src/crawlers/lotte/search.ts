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

  const branches = params.region
    ? LOTTE.branches.filter((b) => b.region === params.region)
    : LOTTE.branches;

  const out: InventoryRow[] = [];
  for (const branch of branches) {
    try {
      const rows = await searchOneBranch(ctx, branch, checkinDt, checkoutDt);
      log("[lotte] branch done", { branch: branch.label, rows: rows.length });
      out.push(...rows);
    } catch (e) {
      // One branch failing (API hiccup, temporary closure) shouldn't kill the
      // whole crawl — log and continue.
      log("[lotte] branch failed, continuing", {
        branch: branch.label,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return out;
}

async function searchOneBranch(
  ctx: CrawlerContext,
  branch: LotteBranch,
  checkinDt: string,
  checkoutDt: string,
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
  return parseRoomList(payload, branch, { checkinDt, checkoutDt });
}
