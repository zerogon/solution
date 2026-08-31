import { addDaysUtc, parseDate, toIsoDate } from "@/lib/utils";
import type { InventoryRow } from "../types";
import { OAKVALLEY, type OakvalleyBranch } from "./config";
import type { OccupancyBook } from "./occupancy";
import { stayRate, type RateBook } from "./rates";
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
  /**
   * 공표된 회원 요금표. 없으면(못 읽었거나 형태가 바뀌었으면) 요금 없이 행만 만든다 —
   * 요금은 부가 정보이고, 그것 때문에 재고를 잃으면 안 된다.
   */
  rates?: RateBook | null,
  /**
   * 공표된 객실 정원. 없으면 정원 없이 행만 만든다 — 요금과 같은 취급이다.
   */
  occupancies?: OccupancyBook | null,
): InventoryRow[] {
  const stayNights = Math.max(1, request.nights);
  const out: InventoryRow[] = [];

  for (const [code, byDate] of nights) {
    const roomType = OAKVALLEY.roomTypes[code] ?? code;
    // 요금표의 줄 이름은 평형 라벨과 **다른 지도**로 찾는다(`config.rateRows` 주석).
    // 여기 없는 코드(밸리 AP·BU)는 요금표에 줄이 둘이라 고를 수 없으므로 그냥 없다.
    const rateRow = OAKVALLEY.rateRows[code];
    // 요금과 달리 별도 지도가 필요 없다 — 조인이 평형 라벨이라 `roomTypes` 하나로
    // 끝난다(`occupancy.ts`의 `buildOccupancyBook` 주석). 요금표는 같은 평형을
    // 일반/노블 두 줄로 갈라 놓아 고를 수 없었지만, 정원은 그 변형들이 같은 값이다.
    const occupancy = occupancies?.get(branch.value)?.get(code) ?? null;
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
        // 예약할 수 없는 방의 가격은 정보가 아니라 잡음이다(`showsPrice`와 같은 판단).
        // `kind`가 `memberTable`인 것이 중요하다 — 이 숫자는 사이트가 이 숙박에 대해
        // 견적한 값이 아니라 공표된 표로 우리가 계산한 값이다.
        ...(available && rates && rateRow
          ? (() => {
              const amount = stayRate(rates, branch.value, rateRow, checkin, stayNights);
              return amount == null ? {} : { price: { amount, kind: "memberTable" as const } };
            })()
          : {}),
        // 요금과 딱 하나 다르다: **`available`을 보지 않는다.** 정원은 가용성의
        // 함수가 아니라 방의 속성이라, 매진된 방도 낡은 행도 여전히 그 인원수다.
        // 이 비대칭은 `InventoryRow.occupancy`의 계약이 정한 것이다.
        ...(occupancy ? { occupancy } : {}),
      });
    }
  }

  return out;
}
