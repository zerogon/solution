import { addDaysUtc, toIsoDate } from "@/lib/utils";
import type { InventoryRow } from "../types";
import { HANWHA, type HanwhaBranch } from "./config";
import { parseDateCompact } from "./format";
import { priceStay, type NightRate, type RateStats, type RateTable } from "./rates";

/** One room type on one night, as 잔여객실 조회 reports it. */
export interface CalendarEntity {
  /** YYYYMMDD */
  SESN_DATE?: string;
  ROOM_TYPE_CD?: string;
  ROOM_TYPE_NM?: string;
  /** See `HANWHA.availableStatusCodes` for the full table. */
  RSRV_CLDR_RSLT_CD?: string;
  /** Real remaining count on bookable rows; goes negative on unbookable ones. */
  RSRV_POSBL_CNT?: number;
  WAIT_POSBL_CNT?: number;
  RSRV_POSBL_YN?: string;
  /** 추첨등급 A/B/C on lottery dates. Not collected — a different product. */
  USER_CALC_GRAD_CD?: string;
  /** 그 날의 시즌 코드. 공개 요금표(`rates.ts`)의 줄과 같은 코드다. */
  SESN_CD?: string;
  /** 날짜·객실별 프로모션 할인율(%). 사이트 달력의 "10%/9실". */
  PP_DSCNT_RT?: number | string;
}

/** The service gateway's envelope. `Data.ds_result` is the calendar. */
export interface CalendarPayload {
  ds?: {
    Data?: { ds_result?: CalendarEntity[] };
    MessageHeader?: { MSG_CD?: string; MSG_TXT?: string };
  };
}

/** roomType → "YYYY-MM-DD" → that one night. */
export type NightMap = Map<string, Map<string, Night>>;

/** One night of one room type. */
export interface Night {
  bookable: boolean;
  /** bookable AND comfortably above the closing-soon threshold. */
  roomy: boolean;
  /**
   * 이 밤의 요금 키. null이면 이 밤은 요금을 판정할 수 없다 — 칸이 비었거나,
   * 같은 (객실명, 날짜)가 서로 다른 코드·시즌·할인으로 두 번 왔다.
   */
  rate: NightRate | null;
}

/**
 * Fold one property's calendar response into a night map.
 *
 * Returns counts rather than throwing on junk rows: a response that parses but
 * yields nothing is a real signal (wrong `BRCH_CD`/`LOC_CD` answers exactly
 * that way, with no error), and the caller logs it.
 *
 * Availability is decided by the status code, never by `RSRV_POSBL_CNT`. The
 * count is a real number of rooms on bookable rows but goes negative on
 * unbookable ones — measured, 68 negative rows in a 450-row response, none of
 * them bookable — so `> 0` is not the same question. The invariant that holds:
 * no row outside `availableStatusCodes` ever had a positive count.
 */
export function collectNights(
  payload: CalendarPayload,
  into: NightMap,
): { entities: number; dropped: number } {
  const entities = payload.ds?.Data?.ds_result ?? [];
  let dropped = 0;

  for (const entity of entities) {
    const date = entity.SESN_DATE ? parseDateCompact(entity.SESN_DATE) : null;
    const roomType = roomTypeName(entity);
    if (!date || !roomType) {
      dropped++;
      continue;
    }

    const bookable = HANWHA.availableStatusCodes.includes(entity.RSRV_CLDR_RSLT_CD ?? "");
    const remaining = entity.RSRV_POSBL_CNT ?? 0;

    const byDate = into.get(roomType) ?? new Map<string, Night>();
    const iso = toIsoDate(date);
    // Merge rather than overwrite, and only ever widen what is known: a repeated
    // key must not silently drop availability we already saw.
    const rate = nightRate(entity);
    const existing = byDate.get(iso);
    const night = existing ?? { bookable: false, roomy: false, rate };
    night.bookable ||= bookable;
    night.roomy ||= bookable && remaining > HANWHA.closingSoonThreshold;
    // Availability only widens, but a rate key that disagrees with itself is not
    // "more known" — it is two answers, and we do not pick one.
    if (existing && !sameRate(existing.rate, rate)) night.rate = null;
    byDate.set(iso, night);
    into.set(roomType, byDate);
  }

  return { entities: entities.length, dropped };
}

/**
 * Turn a night map into inventory rows for a stay of `request.nights`.
 *
 * The response is a CALENDAR OF SINGLE NIGHTS, not an answer about one stay —
 * the same shape SONO and Resom forced, and reached here the same way, by
 * measurement. So an N-night stay starting D is bookable only if every night
 * D..D+N-1 is, and one tight night makes the whole stay 마감임박.
 *
 * A check-in whose nights are not all present is dropped rather than guessed.
 * That fires only at the far edge of the requested span, and a missing row
 * reads as "no data" in the search UI while a wrong one sends someone driving.
 *
 * Every row carries its own `stay`, so `run.ts` files it under its own dates and
 * skips every later hot window this one call already answered.
 */
export function buildRows(
  nights: NightMap,
  branch: HanwhaBranch,
  request: { nights: number },
  rates?: RateTable,
  stats?: RateStats,
): InventoryRow[] {
  const stayNights = Math.max(1, request.nights);
  const out: InventoryRow[] = [];

  for (const [roomType, byDate] of nights) {
    for (const iso of byDate.keys()) {
      const checkin = new Date(`${iso}T00:00:00.000Z`);

      let bookable = true;
      let roomy = true;
      let complete = true;
      for (let n = 0; n < stayNights; n++) {
        const night = byDate.get(toIsoDate(addDaysUtc(checkin, n)));
        if (!night) {
          complete = false;
          break;
        }
        bookable &&= night.bookable;
        roomy &&= night.roomy;
      }
      if (!complete) continue;

      // 예약할 수 없는 방의 요금은 정보가 아니라 잡음이다 — 붙이지 않는다(롯데·오크밸리와 같다).
      let price: InventoryRow["price"];
      if (bookable) {
        const quote = priceStay(byDate, checkin, stayNights, rates);
        if ("amount" in quote) price = { amount: quote.amount, kind: "memberTable" };
        if (stats) {
          if ("amount" in quote) stats.priced++;
          else stats[quote.miss]++;
        }
      }

      out.push({
        branchName: branch.value,
        roomType,
        region: branch.region,
        available: bookable,
        closingSoon: bookable && !roomy,
        // The calendar holds its property selection in page state, not the URL,
        // so there is no per-property deep link — the 잔여객실조회 entry point
        // is the honest answer.
        detailUrl: HANWHA.bookingUrl,
        stay: { checkin, checkout: addDaysUtc(checkin, stayNights) },
        ...(price ? { price } : {}),
      });
    }
  }
  return out;
}

/**
 * The stored room type name.
 *
 * `ROOM_TYPE_NM` is the site's own label and is what a person would recognise
 * ("디럭스(트윈베드)"). An entity missing it falls back to the bare code rather
 * than being guessed at or dropped — `roomType` is part of the upsert unique
 * key, so an invented name would split one room type into two rows, and
 * `debug-hanwha.ts diff` reports codes that show up without a name.
 */
function roomTypeName(entity: CalendarEntity): string | null {
  return entity.ROOM_TYPE_NM?.trim() || entity.ROOM_TYPE_CD?.trim() || null;
}

/** An entity's rate key, or null when any part of it is missing or malformed. */
function nightRate(entity: CalendarEntity): NightRate | null {
  const roomCd = entity.ROOM_TYPE_CD?.trim();
  const seasonCd = entity.SESN_CD?.trim();
  const raw = entity.PP_DSCNT_RT;
  const discount = raw === undefined || raw === null || raw === "" ? 0 : Number(raw);
  if (!roomCd || !seasonCd || !Number.isFinite(discount)) return null;
  return { roomCd, seasonCd, discount };
}

function sameRate(a: NightRate | null, b: NightRate | null): boolean {
  if (!a || !b) return a === b;
  return a.roomCd === b.roomCd && a.seasonCd === b.seasonCd && a.discount === b.discount;
}
