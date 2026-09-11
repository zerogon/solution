import { addDaysUtc } from "@/lib/utils";
import type { InventoryVariant } from "@/lib/variants";
import type { InventoryRow } from "../types";
import { SONO, type SonoBranch } from "./config";
import { formatDateCompact, parseDateCompact } from "./format";

/**
 * Subset of `POST /memberReservation/room/list/pc` we rely on.
 *
 * The full entry has 15 keys (`keys` step, 2026-08-24):
 * `ciYmd errorId errorMsg levelYn pyeongCd resortTypeCd resortTypeNm rmTypeCd roomTypeCd
 * roomTypeNm rsvRmCnt rsvStatusCd rsvStatusNm storeCd viewCd`. The variant axes were
 * received all along and dropped at this type boundary until 2026-09-11.
 */
export interface RoomListPayload {
  success?: boolean;
  error?: unknown;
  body?: Array<{
    storeCd?: string;
    /** The response's own name for the store — deliberately unused, see below. */
    storeNm?: string;
    rmTypeList?: Array<{
      storeCd?: string;
      /** compact YYYYMMDD; the response spans the whole month regardless of request */
      ciYmd?: string;
      /** A 예약원활 · E 마감임박 · D 예약마감 · W 예약대기 · N 예약불가 */
      rsvStatusCd?: string;
      rsvStatusNm?: string;
      /** remaining rooms; goes negative on 예약대기 rows (observed -31) */
      rsvRmCnt?: number;
      /** 리조트 · 호텔 · 펫 */
      resortTypeNm?: string;
      roomTypeNm?: string;
      /**
       * The site's booking unit — one per 뷰(/평형) variant of a room type. This is
       * what the SPA actually reserves, so it is the identity of an `InventoryVariant`.
       */
      rmTypeCd?: string;
      /** View code. **Code only** — the response carries no `viewNm`; names come from `SONO.viewNames`. */
      viewCd?: string;
      /** 평형 code. Measured never to mix inside one (store, roomType) group (2026-08-31, 0/570). */
      pyeongCd?: string;
      roomTypeCd?: string;
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
 * 2. **Group by `resortTypeNm + roomTypeNm` — but judge per variant.** One room
 *    type spans several `rmTypeCd` (뷰 variants) that the booking UI shows as
 *    one choice; the row keeps that grouping so the row count, the unique key
 *    and the manual-rate join stay what they were. Each variant is judged on
 *    its own across the stay and kept on the row as `variants`, and the row's
 *    own verdict is derived from them:
 *
 *      available   = some variant is bookable on **every** night
 *      closingSoon = available && every bookable variant is 마감임박
 *
 *    Until 2026-09-11 the fold OR-ed variants **per night first** and AND-ed the
 *    nights afterwards. For one night that is the same thing; for two nights it
 *    is not — a room whose 스탠다드 is free on night 1 and whose 파크뷰 is free on
 *    night 2 read as bookable, yet the site books one `rmTypeCd` for the whole
 *    stay and neither variant can. That is the same shape as the 2박 bug fixed
 *    on 2026-08-09, one level down. The row still stores booleans; the per-variant
 *    remaining count now survives on `variants` instead of being thrown away.
 *
 *    Summing the counts onto the row would still be wrong — four variants at 11
 *    rooms each, all 마감임박, would read as "44 left" — so the row has no count.
 *
 * 3. **Trust the site's own 마감임박.** `rsvStatusCd` tracks the remaining
 *    count closely (measured across 23 days × 32 stores: median remaining is
 *    54–206 for A and 3–11 for E), so re-deriving it from a threshold the way
 *    the Lotte crawler must would only add a second, worse opinion.
 */
export function parseRoomList(
  payload: RoomListPayload,
  branch: SonoBranch,
  request: { nights: number },
  diag?: ParseDiagnostics,
): InventoryRow[] {
  // The store's name is read from `branch.value`, never from `storeNm`: the
  // place list calls storeCd 09 "소노벨 A 비발디파크" and the room list calls
  // it "소노벨 비발디파크 A". `branch.value` is what the catalog shows and
  // what past rows were keyed by, so it has to win.
  const store = payload.body?.find((s) => s.storeCd === branch.storeCd);
  if (!store) return [];

  /** roomType -> rmTypeCd -> that variant's nights. */
  const tracks = new Map<string, Map<string, VariantTrack>>();
  /** roomType -> every ciYmd any variant answered for. Decides which rows exist. */
  const coverage = new Map<string, Set<string>>();
  let order = 0;

  for (const entry of store.rmTypeList ?? []) {
    const ciYmd = entry.ciYmd?.trim();
    if (!ciYmd) continue;

    const roomTypeNm = entry.roomTypeNm?.trim();
    if (!roomTypeNm) continue;
    const resortTypeNm = entry.resortTypeNm?.trim();
    const roomType = resortTypeNm ? `${resortTypeNm} ${roomTypeNm}` : roomTypeNm;

    // Identity of the variant. `rmTypeCd` is the site's booking unit; if it is
    // ever missing, fall back to the axes that define one, and if those are
    // missing too everything lands in a single track — which is exactly the
    // old fold, so the degradation is to yesterday's behaviour, not to garbage.
    const code =
      entry.rmTypeCd?.trim() ||
      [entry.viewCd, entry.pyeongCd, entry.roomTypeCd].map((v) => v?.trim() ?? "").join("/");

    const byCode = tracks.get(roomType) ?? new Map<string, VariantTrack>();
    let track = byCode.get(code);
    if (!track) {
      track = { code, label: variantLabel(branch, entry, diag), order: order++, nights: new Map() };
      byCode.set(code, track);
      tracks.set(roomType, byCode);
    }
    const night: VariantNight = {
      status: entry.rsvStatusCd ?? "",
      remaining: typeof entry.rsvRmCnt === "number" && Number.isFinite(entry.rsvRmCnt) ? entry.rsvRmCnt : 0,
    };
    // The list occasionally repeats an entry; keep whichever says the room can be
    // booked (the fold used to OR these too), and the larger count when both do.
    const prev = track.nights.get(ciYmd);
    track.nights.set(ciYmd, prev ? mergeNight(prev, night) : night);

    const dates = coverage.get(roomType) ?? new Set<string>();
    dates.add(ciYmd);
    coverage.set(roomType, dates);
  }

  const out: InventoryRow[] = [];
  for (const [roomType, dates] of coverage) {
    const byCode = tracks.get(roomType) ?? new Map<string, VariantTrack>();
    for (const ciYmd of dates) {
      const checkin = parseDateCompact(ciYmd);
      // An unreadable date is dropped rather than filed under the requested
      // window: `run.ts`'s fallback would put some other day's availability on
      // the requested one, which is the confusion `stay` exists to prevent.
      if (!checkin) continue;

      // A stay we weren't given every night of gets no row at all. The API
      // supplies the `nights - 1` tail past month end precisely so this only
      // fires on genuinely missing data. This is the same condition the fold
      // used, so the set of rows is unchanged by the per-variant judgement.
      if (!coversStay(dates, checkin, request.nights)) continue;

      const variants = judgeVariants(byCode, checkin, request.nights);
      const bookable = variants.filter((v) => v.available);
      const available = bookable.length > 0;

      out.push({
        branchName: branch.value,
        roomType,
        region: branch.region,
        available,
        closingSoon: available && bookable.every((v) => v.closingSoon),
        // The search result page holds its state in the SPA session, not the
        // URL (`?step=sch` is all it carries), so there is no per-branch deep
        // link to hand out — the booking entry point is the honest answer.
        detailUrl: SONO.bookingUrl,
        stay: { checkin, checkout: addDaysUtc(checkin, request.nights) },
        variants,
      });
    }
  }
  return out;
}

/**
 * What the parser cannot fix but the crawl log should say. `search.ts` prints
 * it once per batch — a new `viewCd` shows up there as a name, not as a bare
 * code that quietly appears on screen.
 */
export interface ParseDiagnostics {
  unnamedViewCds: Set<string>;
}

/** One night of one variant. */
interface VariantNight {
  status: string;
  remaining: number;
}

/** One variant's calendar, plus what the row will call it and where it appeared. */
interface VariantTrack {
  code: string;
  label: string;
  order: number;
  nights: Map<string, VariantNight>;
}

function isBookable(n: VariantNight): boolean {
  return OPEN_STATUSES.has(n.status) && n.remaining > 0;
}

function mergeNight(a: VariantNight, b: VariantNight): VariantNight {
  const ab = isBookable(a);
  const bb = isBookable(b);
  if (ab !== bb) return ab ? a : b;
  return a.remaining >= b.remaining ? a : b;
}

/** Every night of the stay has at least one entry — the row-existence condition. */
function coversStay(dates: Set<string>, checkin: Date, stayNights: number): boolean {
  for (let i = 0; i < stayNights; i++) {
    if (!dates.has(formatDateCompact(addDaysUtc(checkin, i)))) return false;
  }
  return true;
}

/**
 * Judge every variant across the stay. A variant missing any night of the stay
 * is left out rather than guessed — the row still exists (another variant
 * covered those nights), it just does not list this one for this stay.
 *
 * Two variants may share a label (same `viewCd`, different `rmTypeCd` — the
 * 세부 axis already split in the response). They stay separate, because merging
 * would recreate the "44 left" lie, and the label gets the code appended so the
 * screen never shows two identical lines. A code is allowed on screen; an
 * invented name is not.
 */
function judgeVariants(
  byCode: Map<string, VariantTrack>,
  checkin: Date,
  stayNights: number,
): InventoryVariant[] {
  const judged: Array<{ track: VariantTrack; v: InventoryVariant }> = [];
  for (const track of byCode.values()) {
    let bookable = true;
    let roomy = true;
    let min = Number.POSITIVE_INFINITY;
    let complete = true;
    for (let i = 0; i < stayNights; i++) {
      const night = track.nights.get(formatDateCompact(addDaysUtc(checkin, i)));
      if (!night) {
        complete = false;
        break;
      }
      const ok = isBookable(night);
      bookable &&= ok;
      roomy &&= ok && night.status === "A";
      if (ok) min = Math.min(min, night.remaining);
    }
    if (!complete) continue;
    judged.push({
      track,
      v: {
        label: track.label,
        code: track.code,
        available: bookable,
        closingSoon: bookable && !roomy,
        remaining: bookable && Number.isFinite(min) ? min : null,
      },
    });
  }
  judged.sort((a, b) => a.track.order - b.track.order || a.track.code.localeCompare(b.track.code));

  const labelCount = new Map<string, number>();
  for (const { v } of judged) labelCount.set(v.label, (labelCount.get(v.label) ?? 0) + 1);
  return judged.map(({ v }) =>
    (labelCount.get(v.label) ?? 0) > 1 ? { ...v, label: `${v.label} (${v.code})` } : v,
  );
}

/**
 * The view's display name, or its raw code when we have none.
 *
 * `SONO.viewNames` is tried store-scoped first (`"66:01"`), then global (`"01"`),
 * because the survey has to tell us which one the site means (`debug-sono.ts
 * variants`, Part 1). An unknown code is reported through `diag` and shown as
 * itself — the same rule the Oakvalley parser applies to an unregistered room
 * type. A guessed name would be an error nobody can see.
 */
function variantLabel(
  branch: SonoBranch,
  entry: { viewCd?: string; rmTypeCd?: string },
  diag?: ParseDiagnostics,
): string {
  const viewCd = entry.viewCd?.trim();
  if (!viewCd) return entry.rmTypeCd?.trim() || "(구분 없음)";
  const names: Readonly<Record<string, string>> = SONO.viewNames;
  const name = names[`${branch.storeCd}:${viewCd}`] ?? names[viewCd];
  if (name) return name;
  diag?.unnamedViewCds.add(viewCd);
  return viewCd;
}
