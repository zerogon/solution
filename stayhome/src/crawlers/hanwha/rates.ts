import { addDaysUtc, toIsoDate } from "@/lib/utils";
import type { CrawlerContext } from "../types";
import { mapPool } from "../_shared/pool";
import { HANWHA, type HanwhaBranch } from "./config";
import type { NightMap } from "./parse";

/**
 * 공표된 회원 요금표를 재고 행에 붙인다 — 오크밸리 `rates.ts`와 같은 성격이다.
 *
 * 예약 API(`doExecute.mvc`)에는 금액이 없고, 그 너머의 게이트웨이 서비스도 숙박
 * 요금을 답하지 않는다(`AGENTS.md` 한화 "### 요금"). 그런데 공개 객실 페이지가
 * 요금표를 그리려고 부르는 `getRoomPrice.do`(`HANWHA.rateApiUrl`)가 **무인증 JSON**
 * 이고, 그 줄이 재고 달력과 **같은 `SESN_CD`**로 온다. 그래서 여기서 나오는 숫자는
 * 사이트가 그 숙박에 대해 견적한 값이 아니라 **우리가 조인한 값**이고,
 * `price_kind`가 `memberTable`로 그것을 구별한다.
 *
 * 규칙은 오크밸리와 같다 — **모르면 만들지 않는다.** 한 밤이라도 판정할 수 없으면
 * 그 행은 요금이 없다. 판정할 수 없는 경우는 {@link RateMiss}에 전부 이름이 있다.
 *
 * **절대 던지지 않는다.** 이 콜들은 `run.ts`가 검색 전체를 감싼 `withDeadline` 안에서
 * 돈다 — 부가 정보 하나가 그걸 넘기면 잃는 것은 요금이 아니라 그 패스가 모은
 * **재고 행 전부**다.
 */

/** `${ROOM_TYPE_CD}|YYYYMM` → `SESN_CD` → 1박 요금(원). 표가 공표되지 않은 달은 빈 Map. */
export type RateTable = Map<string, Map<string, number>>;

/** 요금이 붙지 않은 행의 사유. 로그가 이 이름으로 센다. */
export type RateMiss =
  /** 이 지점의 요금표를 받지 못했다(콜 실패 · 예산 부족 · 어휘 불일치). */
  | "noTable"
  /** 그 달의 표가 공표되지 않았다(`amounts: []`). 호텔 두 곳은 항상 이것이다. */
  | "unpublished"
  /** 표는 있는데 그 밤의 `SESN_CD` 줄이 없다. */
  | "season"
  /**
   * 그 밤에 `PP_DSCNT_RT`(날짜·객실별 프로모션 할인율)가 붙어 있다.
   *
   * 사이트 달력이 "10%/9실"로 그리는 값이다. 무엇에 대한 %인지는 사이트가 말하지
   * 않는다 — 안내문이 "특화 객실 추가 금액은 할인 미 적용"이라 적고 있어 표 값에
   * 단순 곱이 아니다. 그래서 곱하지 않고, 표 값을 그대로 내지도 않는다(할인 전
   * 금액을 그 날의 요금이라 부르면 틀린 안내다). 실측 예약가능 밤의 9%(368/3,968).
   */
  | "discount"
  /** 재고의 밤이 (객실코드, 시즌)을 모순되게 두 번 말했거나 아예 말하지 않았다. */
  | "night";

export type RateStats = { priced: number } & Record<RateMiss, number>;

export function emptyRateStats(): RateStats {
  return { priced: 0, noTable: 0, unpublished: 0, season: 0, discount: 0, night: 0 };
}

/** 한 밤의 요금 키. 재고 달력 엔티티에서 온다. */
export interface NightRate {
  roomCd: string;
  seasonCd: string;
  /** `PP_DSCNT_RT`. 0이 아니면 그 밤은 요금을 만들지 않는다. */
  discount: number;
}

interface PriceResponse {
  amounts?: Array<Record<string, unknown>>;
  map?: { atpTp?: Record<string, string> };
}

/** 이 요금 콜을 시작하지 않을 남은 시간의 하한. 콜 하나보다 넉넉해야 한다. */
const MIN_LEFT_MS = 1_500;

/**
 * 한 지점의 요금표를, 이 달력이 실제로 예약 가능하다고 말한 (객실, 달)에 한해 받는다.
 *
 * 매진된 객실의 요금은 붙이지 않으므로 묻지도 않는다 — 실측 386콜(16지점 · 45일).
 * `deadline`은 이 검색이 끝나야 하는 절대 시각이고, 콜 타임아웃은 거기서 유도한다
 * (한화 지점 병렬화가 배운 규칙: 상한만 쓰면 낙오자 하나가 부분 반환을
 * `DeadlineExceeded`로 바꾼다). 시간이 모자라면 남은 (객실, 달)은 표에 없고,
 * 그 행은 `noTable`로 빈칸이 된다.
 */
export async function loadBranchRates(
  ctx: CrawlerContext,
  branch: HanwhaBranch,
  nights: NightMap,
  deadline: number,
): Promise<RateTable> {
  const table: RateTable = new Map();
  const wanted = new Set<string>();
  for (const byDate of nights.values()) {
    for (const [iso, night] of byDate) {
      if (night.bookable && night.rate) wanted.add(rateKey(night.rate.roomCd, iso));
    }
  }
  if (wanted.size === 0) return table;

  let fareCol: string | null | undefined; // undefined = 아직 모름, null = 어휘에 없음
  let failed = 0;
  let skipped = 0;
  const startedAt = Date.now();

  await mapPool([...wanted], HANWHA.ratePool, async (key) => {
    const left = deadline - Date.now();
    if (left < MIN_LEFT_MS || fareCol === null) {
      skipped++;
      return;
    }
    const [roomCd, ym] = key.split("|");
    try {
      const res = await ctx.page.request.post(HANWHA.rateApiUrl, {
        timeout: Math.min(HANWHA.timeouts.rate, left - 500),
        form: { bp_cd: branch.locCd, rm_cd: roomCd, sel_month: `${ym}01` },
      });
      if (!res.ok()) {
        failed++;
        return;
      }
      const body = (await res.json()) as PriceResponse;
      const col = fareColumn(body);
      if (col === null) {
        fareCol = null;
        return;
      }
      if (col !== undefined) fareCol = col;

      const bySeason = new Map<string, number>();
      for (const row of body.amounts ?? []) {
        const seasonCd = typeof row.SESN_CD === "string" ? row.SESN_CD : "";
        // 다른 객실의 줄이 섞여 오면(관측 0) 그 줄은 우리 것이 아니다.
        if (!seasonCd || row.ROOM_TYPE_CD !== roomCd || !col) continue;
        const amount = row[col];
        if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) continue;
        const seen = bySeason.get(seasonCd);
        // 같은 시즌이 두 값을 말하면 어느 쪽도 고르지 않는다.
        bySeason.set(seasonCd, seen === undefined || seen === amount ? amount : NaN);
      }
      for (const [s, v] of bySeason) if (Number.isNaN(v)) bySeason.delete(s);
      table.set(key, bySeason);
    } catch {
      failed++;
    }
  });

  if (fareCol === null) {
    // 어휘가 바뀌었다 — 이 크롤러가 고를 열을 사이트가 더 이상 그 이름으로 부르지
    // 않는다. 추측해서 다른 열을 쓰면 틀린 금액이고, 그래서 이 지점은 요금이 없다.
    ctx.log("[hanwha] rate fare not in site vocabulary — no prices", {
      branch: branch.value,
      rateFare: HANWHA.rateFare,
    });
    return new Map();
  }
  if (failed > 0 || skipped > 0) {
    ctx.log("[hanwha] rate table incomplete", {
      branch: branch.value,
      wanted: wanted.size,
      failed,
      skipped,
      ms: Date.now() - startedAt,
    });
  }
  return table;
}

/**
 * 한 숙박의 총액. 밤마다 (객실, 밤의 달, 그 밤의 시즌)으로 1박 값을 찾아 더한다.
 *
 * 시즌도 달도 밤마다 다르므로 한 밤 값에 박수를 곱하지 않는다(오크밸리와 같은 이유).
 */
export function priceStay(
  byDate: Map<string, { rate: NightRate | null }>,
  checkin: Date,
  stayNights: number,
  rates: RateTable | undefined,
): { amount: number } | { miss: RateMiss } {
  if (!rates || rates.size === 0) return { miss: "noTable" };
  let total = 0;
  for (let n = 0; n < stayNights; n++) {
    const iso = toIsoDate(addDaysUtc(checkin, n));
    const rate = byDate.get(iso)?.rate;
    if (!rate) return { miss: "night" };
    if (rate.discount !== 0) return { miss: "discount" };
    const bySeason = rates.get(rateKey(rate.roomCd, iso));
    if (!bySeason) return { miss: "noTable" };
    if (bySeason.size === 0) return { miss: "unpublished" };
    const amount = bySeason.get(rate.seasonCd);
    if (amount === undefined) return { miss: "season" };
    total += amount;
  }
  return { amount: total };
}

function rateKey(roomCd: string, iso: string): string {
  return `${roomCd}|${iso.slice(0, 4)}${iso.slice(5, 7)}`;
}

/**
 * `HANWHA.rateFare`가 가리키는 금액 칸의 이름(`RSRV_TYPE_CD_2` 꼴).
 *
 * 열 번호는 응답의 `map.atpTp`가 정한다. undefined는 "이 응답은 말하지 않았다"
 * (빈 달에도 어휘는 온다 — 관측), null은 "말했는데 그 이름이 없다".
 */
function fareColumn(body: PriceResponse): string | null | undefined {
  const vocab = body.map?.atpTp;
  if (!vocab) return (body.amounts?.length ?? 0) > 0 ? null : undefined;
  const hits = Object.entries(vocab).filter(([, name]) => name.trim() === HANWHA.rateFare);
  return hits.length === 1 ? `RSRV_TYPE_CD_${hits[0][0]}` : null;
}
