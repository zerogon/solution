import type { InventoryRow } from "../types";
import { LOTTE, type LotteBranch } from "./config";

/** Subset of the roomList API response we rely on. */
export interface RoomListPayload {
  rsltCd?: string;
  rsltMsg?: string;
  roomList?: Array<{
    roomNm?: string;
    /** remaining bookable rooms — "0" means sold out */
    roomCnt?: string | number;
    /** waitlist count for sold-out rooms */
    waitRsvCnt?: string | number;
    onlineUseYn?: string;
    roomFlgNm?: string;
  }>;
}

/**
 * Map a roomList API payload to normalized inventory rows.
 *
 * Availability semantics (observed 2026-07-26 against bizCd=81):
 * - `roomCnt` is the remaining-room count; sold-out rooms report "0" and the
 *   UI offers 대기예약 instead of booking.
 * - `onlineUseYn: "N"` rooms aren't bookable online regardless of count.
 */
export function parseRoomList(
  payload: RoomListPayload,
  branch: LotteBranch,
  dates: { checkinDt: string; checkoutDt: string },
): InventoryRow[] {
  // Empty roomList is a legitimate result: fully booked for the range
  // ("AVAILRSV" = 대기예약만 가능) or reservations not open ("NORSV").
  // The caller logs rsltCd/rsltMsg; here it just yields zero rows.
  const rooms = payload.roomList ?? [];

  const detailUrl =
    `${LOTTE.bookingUrl}?bizCd=${branch.bizCd}` +
    `&checkinDt=${dates.checkinDt}&checkoutDt=${dates.checkoutDt}` +
    `&roomCnt=1&reservationType=BAR`;

  const out: InventoryRow[] = [];
  const seen = new Set<string>();
  for (const room of rooms) {
    const roomType = room.roomNm?.trim();
    if (!roomType || seen.has(roomType)) continue;
    seen.add(roomType);

    const remaining = Number(room.roomCnt ?? 0);
    const available = Number.isFinite(remaining) && remaining > 0 && room.onlineUseYn !== "N";

    out.push({
      branchName: branch.value,
      roomType,
      region: branch.region,
      available,
      closingSoon: available && remaining <= LOTTE.closingSoonThreshold,
      detailUrl,
    });
  }
  return out;
}
