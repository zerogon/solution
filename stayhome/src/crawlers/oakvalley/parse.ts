import { addDaysUtc, parseDate, toIsoDate } from "@/lib/utils";
import type { InventoryRow } from "../types";
import { OAKVALLEY, type OakvalleyBranch } from "./config";
import { dayOfMonthToDate } from "./format";

/** One row of `entitys[]`. `CD_DATE` is a day-of-month, not a date. */
export interface CalendarEntity {
  CD_DATE?: string | number;
  WEEK_DAY?: string | number;
  DAYS?: string | number;
  AVA_YN?: string;
  RM_RMTYPE?: string;
  RM_REF1?: string;
}

/** The `*.pns` envelope. HTTP 200 with `success:false` is still a failure. */
export interface CalendarPayload {
  entitys?: CalendarEntity[];
  entitys2?: unknown[];
  errMsg?: string;
  errTitle?: string;
  message?: string;
  success?: boolean | string;
  totalCount?: number | string;
}

/**
 * roomType code → "YYYY-MM-DD" → is that one night bookable.
 *
 * There is no `roomy`/scarcity field here on purpose; see `closingSoon` below.
 */
export type NightMap = Map<string, Map<string, boolean>>;

/**
 * Fold one month's payload into the accumulator.
 *
 * Collecting and building are separate steps here, unlike `resom/parse.ts` and
 * `sono/parse.ts` which do both in one pass. The reason is the month tail: an
 * Oak Valley response stops at month end, so the second night of a stay that
 * starts on the 31st lives in a *different response*. Building rows before every
 * month is merged would drop the last day of every month — silently, since a
 * missing row reads as "데이터 없음".
 *
 * Merges with `||=` rather than overwriting so repeated fetches can only widen
 * what is known.
 */
export function collectNights(
  payload: CalendarPayload,
  scope: { year: number; month: number },
  into: NightMap,
): { entities: number; dropped: number } {
  const entitys = payload.entitys ?? [];
  let dropped = 0;

  for (const e of entitys) {
    const code = (e.RM_RMTYPE ?? "").trim();
    const date = dayOfMonthToDate(scope.year, scope.month, e.CD_DATE);
    if (!code || !date) {
      dropped++;
      continue;
    }
    const iso = toIsoDate(date);
    let byDate = into.get(code);
    if (!byDate) {
      byDate = new Map<string, boolean>();
      into.set(code, byDate);
    }
    byDate.set(iso, (byDate.get(iso) ?? false) || e.AVA_YN === "Y");
  }

  return { entities: entitys.length, dropped };
}

/**
 * Merged calendar → inventory rows for stays of `nights` nights.
 *
 * `V_IN_BAKSU` is ignored by the site (measured: 1박/2박/3박 returned identical
 * statuses), so the response describes single nights and the AND is ours to do:
 * an N-night stay is bookable only if every one of its nights is. A stay with
 * even one night missing from the map gets **no row** — the alternative is
 * asserting a stay nobody measured, and a wrong row costs a wasted trip while a
 * missing one only reads as no data.
 *
 * Every row carries its own `stay`, so `run.ts` files it under its own dates and
 * skips the later hot windows these rows already answered.
 */
export function buildRows(
  nights: NightMap,
  branch: OakvalleyBranch,
  request: { nights: number },
): InventoryRow[] {
  const stayNights = Math.max(1, request.nights);
  const out: InventoryRow[] = [];

  for (const [code, byDate] of nights) {
    const roomType = OAKVALLEY.roomTypes[code] ?? code;
    for (const iso of byDate.keys()) {
      const checkin = parseDate(iso);
      let available = true;
      let complete = true;
      for (let n = 0; n < stayNights; n++) {
        const night = byDate.get(toIsoDate(addDaysUtc(checkin, n)));
        if (night === undefined) {
          complete = false;
          break;
        }
        available &&= night;
      }
      if (!complete) continue;

      out.push({
        branchName: branch.value,
        roomType,
        region: branch.region,
        available,
        // Always false, and this is the third distinct provenance for this field
        // across four crawlers. Lotte thresholds a real remaining count; SONO
        // uses the site's own 마감임박 code; Oak Valley publishes neither — the
        // observed AVA_YN alphabet is exactly {"Y","N"} and no count appears
        // anywhere in the payload. The 대기(waitlist) flow is a different
        // question ("you may queue for a room that is NOT bookable"), so
        // mapping it here would put a 마감임박 chip on unavailable rows.
        // Inventing scarcity from the calendar's shape would be worse still.
        closingSoon: false,
        detailUrl: OAKVALLEY.bookingUrl,
        stay: { checkin, checkout: addDaysUtc(checkin, stayNights) },
      });
    }
  }

  return out;
}
