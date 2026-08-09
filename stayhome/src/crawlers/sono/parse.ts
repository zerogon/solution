import type { InventoryRow } from "../types";
import { SONO, type SonoBranch } from "./config";

/** Subset of `POST /memberReservation/room/list/pc` we rely on. */
export interface RoomListPayload {
  success?: boolean;
  error?: unknown;
  body?: Array<{
    storeCd?: string;
    /** The response's own name for the store — deliberately unused, see below. */
    storeNm?: string;
    rmTypeList?: Array<{
      storeCd?: string;
      /** compact YYYYMMDD; the response spans ~23 days regardless of request */
      ciYmd?: string;
      /** A 예약원활 · E 마감임박 · D 예약마감 · W 예약대기 · N 예약불가 */
      rsvStatusCd?: string;
      rsvStatusNm?: string;
      /** remaining rooms; goes negative on 예약대기 rows (observed -31) */
      rsvRmCnt?: number;
      /** 리조트 · 호텔 · 펫 */
      resortTypeNm?: string;
      roomTypeNm?: string;
    }>;
  }>;
}

/** Status codes that mean a room can actually be booked right now. */
const OPEN_STATUSES = new Set(["A", "E"]);

/**
 * Map one store's room-list entries to normalized inventory rows.
 *
 * Three decisions worth stating, all of them forced by the shape of the data:
 *
 * 1. **Filter to `checkinDt`.** The API returns every date in a ~23-day span
 *    around the request. `run.ts` upserts whatever we return under the single
 *    window it asked for, so unfiltered rows would file August 20th's
 *    availability under August 12th.
 *
 * 2. **Group by `resortTypeNm + roomTypeNm`, don't sum.** One room type spans
 *    several `rmTypeCd` (평형/뷰 variants) that the booking UI shows as one
 *    choice. Grouping keeps the row count sane, and since `ResortInventory`
 *    stores booleans rather than a count, nothing is lost — whereas summing
 *    the counts would be actively misleading: four variants at 11 rooms each,
 *    all flagged 마감임박, would read as "44 left".
 *
 * 3. **Trust the site's own 마감임박.** `rsvStatusCd` tracks the remaining
 *    count closely (measured across 23 days × 32 stores: median remaining is
 *    54–206 for A and 3–11 for E), so re-deriving it from a threshold the way
 *    the Lotte crawler must would only add a second, worse opinion.
 *    `closingSoon` therefore means "every bookable variant is 마감임박".
 */
export function parseRoomList(
  payload: RoomListPayload,
  branch: SonoBranch,
  checkinDt: string,
): InventoryRow[] {
  // The store's name is read from `branch.value`, never from `storeNm`: the
  // place list calls storeCd 09 "소노벨 A 비발디파크" and the room list calls
  // it "소노벨 비발디파크 A". `branch.value` is what the catalog shows and
  // what past rows were keyed by, so it has to win.
  const store = payload.body?.find((s) => s.storeCd === branch.storeCd);
  if (!store) return [];

  /** roomType label → whether any variant is bookable, and whether any is 원활. */
  const groups = new Map<string, { bookable: boolean; roomy: boolean }>();

  for (const entry of store.rmTypeList ?? []) {
    if (entry.ciYmd !== checkinDt) continue;

    const roomTypeNm = entry.roomTypeNm?.trim();
    if (!roomTypeNm) continue;
    const resortTypeNm = entry.resortTypeNm?.trim();
    const roomType = resortTypeNm ? `${resortTypeNm} ${roomTypeNm}` : roomTypeNm;

    const status = entry.rsvStatusCd ?? "";
    const remaining = entry.rsvRmCnt ?? 0;
    const bookable = OPEN_STATUSES.has(status) && remaining > 0;

    const group = groups.get(roomType) ?? { bookable: false, roomy: false };
    group.bookable ||= bookable;
    group.roomy ||= bookable && status === "A";
    groups.set(roomType, group);
  }

  const out: InventoryRow[] = [];
  for (const [roomType, { bookable, roomy }] of groups) {
    out.push({
      branchName: branch.value,
      roomType,
      region: branch.region,
      available: bookable,
      closingSoon: bookable && !roomy,
      // The search result page holds its state in the SPA session, not the
      // URL (`?step=sch` is all it carries), so there is no per-branch deep
      // link to hand out — the booking entry point is the honest answer.
      detailUrl: SONO.bookingUrl,
    });
  }
  return out;
}
