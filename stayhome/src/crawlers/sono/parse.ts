import { addDaysUtc } from "@/lib/utils";
import type { InventoryRow } from "../types";
import { SONO, type SonoBranch } from "./config";
import { formatDateCompact, parseDateCompact } from "./format";

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
 * The response is a CALENDAR, not an answer about one stay. Measured against
 * the live API (2026-08-09, `nights` = 1 / 2 / 7 against the same `ciYmd`):
 *
 *   - it returns the whole month containing `ciYmd`, clipped at today and
 *     extended by `nights - 1` days (0809→0809-0831, 0820→0809-0831,
 *     0915→0901-0930), so the requested date only picks the month; and
 *   - `nights` does not change a single status or count. All 299 shared
 *     entries were byte-identical across 1, 2 and 7 nights.
 *
 * Both facts drive what this parser does:
 *
 * 1. **Emit every check-in date in the month, and AND across the stay.**
 *    Since each entry describes one night, an N-night stay starting D is
 *    bookable only if every night D..D+N-1 is. Reporting D's own status as if
 *    it answered for the whole stay — which is what filing the response under
 *    the requested window amounted to — claims availability nobody measured.
 *    The `nights - 1` tail is exactly the data this needs at a month boundary,
 *    so a stay running into the next month is still answerable; a check-in
 *    whose nights are not all present is dropped rather than guessed.
 *
 *    Rows carry their own `stay`, so `run.ts` files each under its own dates
 *    and the scheduler skips the windows this call already answered. That is
 *    what turns 60 hot windows into 4 requests (2 months x 2 stay lengths).
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
  request: { nights: number },
): InventoryRow[] {
  // The store's name is read from `branch.value`, never from `storeNm`: the
  // place list calls storeCd 09 "소노벨 A 비발디파크" and the room list calls
  // it "소노벨 비발디파크 A". `branch.value` is what the catalog shows and
  // what past rows were keyed by, so it has to win.
  const store = payload.body?.find((s) => s.storeCd === branch.storeCd);
  if (!store) return [];

  /** roomType -> ciYmd -> that one night, merged across its 평형/뷰 variants. */
  const calendar = new Map<string, Map<string, Night>>();

  for (const entry of store.rmTypeList ?? []) {
    const ciYmd = entry.ciYmd?.trim();
    if (!ciYmd) continue;

    const roomTypeNm = entry.roomTypeNm?.trim();
    if (!roomTypeNm) continue;
    const resortTypeNm = entry.resortTypeNm?.trim();
    const roomType = resortTypeNm ? `${resortTypeNm} ${roomTypeNm}` : roomTypeNm;

    const status = entry.rsvStatusCd ?? "";
    const remaining = entry.rsvRmCnt ?? 0;
    const bookable = OPEN_STATUSES.has(status) && remaining > 0;

    const nights = calendar.get(roomType) ?? new Map<string, Night>();
    const night = nights.get(ciYmd) ?? { bookable: false, roomy: false };
    night.bookable ||= bookable;
    night.roomy ||= bookable && status === "A";
    nights.set(ciYmd, night);
    calendar.set(roomType, nights);
  }

  const out: InventoryRow[] = [];
  for (const [roomType, nights] of calendar) {
    for (const ciYmd of nights.keys()) {
      const checkin = parseDateCompact(ciYmd);
      // An unreadable date is dropped rather than filed under the requested
      // window: `run.ts`'s fallback would put some other day's availability on
      // the requested one, which is the confusion `stay` exists to prevent.
      if (!checkin) continue;

      // A stay we weren't given every night of gets no row at all. The API
      // supplies the `nights - 1` tail past month end precisely so this only
      // fires on genuinely missing data.
      const stay = collectStay(nights, checkin, request.nights);
      if (!stay) continue;

      out.push({
        branchName: branch.value,
        roomType,
        region: branch.region,
        available: stay.bookable,
        closingSoon: stay.bookable && !stay.roomy,
        // The search result page holds its state in the SPA session, not the
        // URL (`?step=sch` is all it carries), so there is no per-branch deep
        // link to hand out — the booking entry point is the honest answer.
        detailUrl: SONO.bookingUrl,
        stay: { checkin, checkout: addDaysUtc(checkin, request.nights) },
      });
    }
  }
  return out;
}

/** One night of one room type, merged across its 평형/뷰 variants. */
interface Night {
  bookable: boolean;
  roomy: boolean;
}

/**
 * Fold a stay's nights into one verdict, or null if the calendar doesn't cover
 * all of them. Bookable means every night is; 원활 means every night is, so a
 * single 마감임박 night makes the whole stay 마감임박 — the same reading the
 * one-night rows always had, extended over the stay.
 */
function collectStay(nights: Map<string, Night>, checkin: Date, stayNights: number): Night | null {
  let bookable = true;
  let roomy = true;
  for (let i = 0; i < stayNights; i++) {
    const night = nights.get(formatDateCompact(addDaysUtc(checkin, i)));
    if (!night) return null;
    bookable &&= night.bookable;
    roomy &&= night.roomy;
  }
  return { bookable, roomy };
}
