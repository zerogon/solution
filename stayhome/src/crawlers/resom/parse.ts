import { addDaysUtc } from "@/lib/utils";
import { occupancyOf } from "../_shared/occupancy";
import type { InventoryRow } from "../types";
import { RESOM, type ResomBranch } from "./config";
import { formatDateCompact, parseDateCompact } from "./format";

/** One room type on one check-in date, as `calendarRooms` reports it. */
export interface CalendarEntry {
  rmTypeCd?: string;
  rmTypeNm?: string;
  dongNm?: string;
  condoCd?: string;
  /** goes negative when oversubscribed (observed -33) */
  remdRmCnt?: number;
  /** 1 ⟺ remdRmCnt > 0 on every entry measured */
  statusBooking?: number;
  /** member-level, not per-date — always "Y" on the account we crawl with */
  rsvPsblYn?: string;
  rsvBlckCd?: string;

  /**
   * 기준인원 / 최대인원(명). 문자열 숫자로 온다(`"5"`).
   *
   * ⚠️ **`allCondos`의 `initPersCount`/`maxPersCount`와 이름이 비슷한 다른 필드다.**
   * 그쪽은 17엔트리 전부 `0`이고(죽은 칸), 값은 여기에만 있다 — 실측(2026-08-31,
   * 포레스트 리솜 506엔트리) `initPersCnt {"2","5"}` · `maxPersCnt {"4","6","7"}`,
   * 결측 0건. `Cnt` 하나 차이라, 이름만 보고 고르면 전 객실을 0명으로 발행한다.
   * 이 저장소가 `rmAmt`(506엔트리 전부 `"0"`)에서 이미 한 번 배운 함정이다.
   */
  initPersCnt?: string | number;
  maxPersCnt?: string | number;
}

/**
 * `GET {apiBase}/roomReservation/calendarRooms` — keyed by compact check-in
 * date, each holding that day's room types.
 */
export type CalendarPayload = Record<string, CalendarEntry[]>;

/**
 * Map one property's calendar to normalized inventory rows.
 *
 * The response is a CALENDAR OF SINGLE NIGHTS, not an answer about one stay.
 * Measured against the live API (2026-08-09):
 *
 *   - the keys are check-in dates and the `ciYmd`/`coYmd` range is honoured
 *     literally — 20260809 → 20260930 returned all 53 days with no gap at the
 *     month boundary, so one call covers a whole hot window; and
 *   - `nights` changes nothing. 1, 2 and 7 nights returned identical
 *     `statusBooking` and `remdRmCnt` on all 180 shared entries.
 *
 * So a stay is not something this API answers, and this parser derives it:
 *
 * 1. **Emit every check-in date, and AND across the stay.** An N-night stay
 *    starting D is bookable only if every night D..D+N-1 is. Filing the
 *    response under the requested window instead would report D's own status as
 *    if it answered for the whole stay — availability nobody measured. A
 *    check-in whose nights are not all present is dropped rather than guessed;
 *    that only fires at the far edge of the requested range.
 *
 *    Rows carry their own `stay`, so `run.ts` files each under its own dates
 *    and skips the windows this call already answered.
 *
 * 2. **Availability reads `statusBooking`, not the count.** `remdRmCnt` goes
 *    negative when oversubscribed, so `> 0` on the raw number is not obviously
 *    the same question — but `statusBooking === 1` matched `remdRmCnt > 0` on
 *    all 180 entries measured, and the flag is the site's own answer.
 *
 * 3. **`closingSoon` is a threshold, not a signal.** Unlike SONO, this API
 *    publishes no 마감임박 code, so the crawler infers one the way Lotte does.
 *    Only positive counts are compared: a negative count already means not
 *    bookable, and would otherwise read as "≤ 2 rooms left".
 */
export function parseCalendar(
  payload: CalendarPayload,
  branch: ResomBranch,
  request: { nights: number },
): InventoryRow[] {
  /** roomType -> check-in date -> that one night. */
  const calendar = new Map<string, Map<string, Night>>();
  /**
   * roomType -> 그 객실의 정원. 값은 날짜가 아니라 **방**의 속성이라 달력 밖에 둔다.
   *
   * `null`은 "판정하지 않는다"는 뜻이고, 한 번 null이 되면 되돌아오지 않는다 —
   * 같은 객실유형의 엔트리가 서로 다른 정원을 주면 어느 쪽도 고를 수 없기 때문이다.
   * 실측에서 그런 불일치는 0건이지만, 생긴다면 증상은 에러가 아니라 조용히 틀린 안내다.
   */
  const occupancies = new Map<string, { standard: number; max: number } | null>();

  for (const [dateKey, entries] of Object.entries(payload ?? {})) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const roomType = roomTypeName(entry);
      if (!roomType) continue;

      const remaining = entry.remdRmCnt ?? 0;
      const bookable = entry.statusBooking === 1;

      const nights = calendar.get(roomType) ?? new Map<string, Night>();
      // One entry per room type per day, but merge defensively rather than
      // overwrite — a duplicated key must not silently drop availability.
      const night = nights.get(dateKey) ?? { bookable: false, roomy: false };
      night.bookable ||= bookable;
      night.roomy ||= bookable && remaining > RESOM.closingSoonThreshold;
      nights.set(dateKey, night);
      calendar.set(roomType, nights);

      const occupancy = occupancyOf(entry.initPersCnt, entry.maxPersCnt);
      if (!occupancies.has(roomType)) {
        occupancies.set(roomType, occupancy);
      } else {
        const seen = occupancies.get(roomType) ?? null;
        const same =
          seen != null &&
          occupancy != null &&
          seen.standard === occupancy.standard &&
          seen.max === occupancy.max;
        if (!same) occupancies.set(roomType, null);
      }
    }
  }

  const out: InventoryRow[] = [];
  for (const [roomType, nights] of calendar) {
    for (const dateKey of nights.keys()) {
      const checkin = parseDateCompact(dateKey);
      // An unreadable key is dropped rather than filed under the requested
      // window: `run.ts`'s fallback would put some other day's availability on
      // the requested one, which is the confusion `stay` exists to prevent.
      if (!checkin) continue;

      const stay = collectStay(nights, checkin, request.nights);
      if (!stay) continue;

      out.push({
        branchName: branch.value,
        roomType,
        region: branch.region,
        available: stay.bookable,
        closingSoon: stay.bookable && !stay.roomy,
        // The reservation SPA holds its selection in memory, not the URL, so
        // there is no per-property deep link to hand out — the 회원 객실 예약
        // entry point is the honest answer.
        detailUrl: RESOM.bookingUrl,
        stay: { checkin, checkout: addDaysUtc(checkin, request.nights) },
        // 요금과 달리 `available`을 보지 않는다 — 정원은 가용성의 함수가 아니라
        // 방의 속성이다. 계약(`InventoryRow.occupancy`)의 비대칭이 그것이다.
        ...(occupancies.get(roomType) == null
          ? {}
          : { occupancy: occupancies.get(roomType)! }),
      });
    }
  }
  return out;
}

/**
 * The stored room type name.
 *
 * `dongNm` is part of it because the buildings are marketed as distinct places
 * (포레스트 / 레스트리, 오션빌라스 / 오션타워, 스테이타워 / 플렉스타워) and
 * because it keeps the name unique: `roomType` is part of the inventory row's
 * unique key, so a future collision between two 동's identically-named types
 * would silently drop one of them at upsert.
 *
 * Exported because `price.ts` has to reach the same row from a raw calendar
 * entry. Rebuilding the key there would let the two drift, and the symptom of
 * a drifted key is not an error — it is prices silently attaching to nothing.
 */
export function roomTypeName(entry: CalendarEntry): string | null {
  const name = entry.rmTypeNm?.trim();
  if (!name) return null;
  const dong = entry.dongNm?.trim();
  return dong ? `${dong} ${name}` : name;
}

/** One night of one room type. */
interface Night {
  bookable: boolean;
  roomy: boolean;
}

/**
 * Fold a stay's nights into one verdict, or null if the calendar doesn't cover
 * all of them. Bookable means every night is; a single tight night makes the
 * whole stay 마감임박.
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
