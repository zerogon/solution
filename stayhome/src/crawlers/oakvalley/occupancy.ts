import type { Page } from "playwright-core";
import { occupancyOf } from "../_shared/occupancy";
import type { CrawlerContext } from "../types";
import { OAKVALLEY } from "./config";

/**
 * 공표된 객실 정원을 재고 행에 붙인다.
 *
 * 이 사이트의 예약 API에는 정원이 없다(`getCalendar` 14키 전수, 2026-08-24 `keys`).
 * 그런데 마케팅 API `GET api.oakvalley.co.kr/api/v1/room?idCondo=<콘도>`가
 * **무인증으로** 객실마다 `standardCount`/`maxCount`를 준다 — 요금이
 * `api/v1/village`에 있던 것과 같은 자리, 같은 계보의 발견이다(2026-08-31).
 *
 * ⚠️ 이 파일 머리말과 `AGENTS.md`가 오랫동안 `/api/v1/condo`를 "재고가 없다"고만
 * 적어 두었다. 사실이었고 — **재고가 없다는 것이 정원도 없다는 뜻은 아니었다.**
 * `api/v1/room`은 이 저장소가 한 번도 부른 적 없는 엔드포인트였고, 파라미터 이름
 * (`idCondo`)은 추측이 아니라 마케팅 SPA 번들의 요청 조립부에서 읽었다
 * (리솜 `room/price/list`를 이름만 보고 골랐다가 패키지 요금을 집을 뻔한 전례).
 *
 * 요금과 달리 `withPrices` 게이트를 타지 않는 이유는 rates.ts와 같다 — 그 게이트가
 * 재는 것은 **비용**이고, 여기는 패스당 한 번이다.
 */

/** 빌리지명 → 그 빌리지의 `RM_RMTYPE` → 정원. */
export type OccupancyBook = Map<string, Map<string, { standard: number; max: number }>>;

/**
 * 패스당 한 번만 받는다. `ctx.page`로 키잉해 페이지와 함께 죽게 하는 것은
 * `rates.ts`의 `books`, `hanwha/search.ts`의 `booted`와 같은 이유다 — 모듈 캐시로
 * 두면 다음 크롤이 이미 없는 브라우저의 표를 물려받는다.
 */
const books = new WeakMap<Page, OccupancyBook | null>();

interface VillageRow {
  oakValleyVillageType?: string | null;
  introduceTitle?: string | null;
}
interface CondoRow {
  id?: number | null;
  oakValleyVillageType?: string | null;
}
interface RoomRow {
  name?: string | null;
  standardCount?: number | string | null;
  maxCount?: number | string | null;
}

export async function loadOccupancyBook(ctx: CrawlerContext): Promise<OccupancyBook | null> {
  const { page, log } = ctx;
  if (books.has(page)) return books.get(page) ?? null;

  let book: OccupancyBook | null = null;
  try {
    const villages = await getJson<VillageRow[]>(ctx, OAKVALLEY.villageApiUrl);
    const condos = await getJson<CondoRow[]>(ctx, OAKVALLEY.condoApiUrl);

    /** GOLF/SKI 같은 내부 타입 → 우리가 쓰는 빌리지명("밸리 빌리지"). */
    const villageName = new Map<string, string>();
    for (const v of villages ?? []) {
      const type = v.oakValleyVillageType?.trim();
      const title = v.introduceTitle?.trim();
      // 성문안(미출시)은 전 필드가 null이라 여기서 자동으로 빠진다.
      if (type && title) villageName.set(type, title);
    }

    /** 빌리지명 → 객실명 → 정원. 같은 이름이 여러 콘도에 있으면 아래에서 합의를 본다. */
    const rooms = new Map<string, Map<string, { standard: number; max: number } | null>>();
    for (const condo of condos ?? []) {
      const name = villageName.get(condo.oakValleyVillageType?.trim() ?? "");
      if (!name || condo.id == null) continue;
      const list = await getJson<RoomRow[]>(
        ctx,
        `${OAKVALLEY.roomApiUrl}?idCondo=${encodeURIComponent(String(condo.id))}`,
      );
      const byName = rooms.get(name) ?? new Map();
      for (const r of list ?? []) {
        const label = r.name?.trim();
        if (!label) continue;
        record(byName, label, occupancyOf(r.standardCount, r.maxCount));
      }
      rooms.set(name, byName);
    }

    book = buildOccupancyBook(rooms);
  } catch (e) {
    // 절대 던지지 않는다: 부가 정보이고, `run.ts`가 `searchAvailability` 전체를
    // 하나의 deadline으로 감싸므로 여기서 새어 나간 예외는 그 지점의 재고 행 전부를
    // 잃게 만든다(`rates.ts`와 같은 이유).
    log("[oakvalley] 정원표를 읽지 못함 — 정원 없이 진행", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  if (book) {
    log("[oakvalley] 정원표 적재", {
      villages: [...book.keys()],
      types: [...book.values()].reduce((n, m) => n + m.size, 0),
    });
  }
  books.set(page, book);
  return book;
}

/**
 * 객실명 지도 → `RM_RMTYPE` 지도.
 *
 * 조인은 **평형 라벨의 포함**이다(`OAKVALLEY.roomTypes`의 "31평" 등). 정확 일치가
 * 아닌 이유는 사이트가 같은 평형을 여러 이름으로 내걸기 때문이고, 실측(2026-08-31)이
 * 그 이름들을 보여준다 — 밸리 `31평`은 `31평`·`노블 31평 · A`·`노블 31평·B`로,
 * 힐스 `48평`은 `48평·A`·`48평·B`로 나뉜다.
 *
 * **요금에서 막혔던 바로 그 자리인데 정원에서는 뚫린다.** 요금표의 `31평 (일반)`과
 * `31평 (노블)`은 20% 달라서 어느 쪽도 고를 수 없었지만(`config.rateRows`의 AP·BU가
 * 비어 있는 이유), 정원은 그 변형들이 **전부 같은 값**이다. 그래서 규칙이 하나로 선다:
 * **매칭된 이름들이 한 값에 합의할 때만 붙이고, 하나라도 다르면 붙이지 않는다.**
 * 실측에서 9종 전부 합의했다.
 */
export function buildOccupancyBook(
  rooms: Map<string, Map<string, { standard: number; max: number } | null>>,
): OccupancyBook | null {
  const out: OccupancyBook = new Map();
  for (const [village, byName] of rooms) {
    const byCode = new Map<string, { standard: number; max: number }>();
    for (const [code, label] of Object.entries(OAKVALLEY.roomTypes)) {
      if (!label) continue;
      const agreed = new Map<string, { standard: number; max: number } | null>();
      let matched = 0;
      for (const [name, occ] of byName) {
        if (!name.includes(label)) continue;
        matched++;
        record(agreed, code, occ);
      }
      const value = matched > 0 ? (agreed.get(code) ?? null) : null;
      if (value) byCode.set(code, value);
    }
    if (byCode.size) out.set(village, byCode);
  }
  return out.size ? out : null;
}

/**
 * 한 칸에 값을 적되, **이미 다른 값이 있으면 `null`로 못 박는다.**
 *
 * `null`은 "판정하지 않는다"이고 되돌아오지 않는다. 어느 쪽이 맞는지 알 수 없을 때
 * 고르지 않는 것이 이 크롤러의 규칙이다(`buildRateBook`이 두 빌리지의 달력이
 * 어긋나면 요금을 0개 만드는 것과 같은 판단).
 */
function record(
  into: Map<string, { standard: number; max: number } | null>,
  key: string,
  value: { standard: number; max: number } | null,
) {
  if (!into.has(key)) {
    into.set(key, value);
    return;
  }
  const seen = into.get(key) ?? null;
  const same =
    seen != null && value != null && seen.standard === value.standard && seen.max === value.max;
  if (!same) into.set(key, null);
}

async function getJson<T>(ctx: CrawlerContext, url: string): Promise<T | null> {
  const res = await ctx.page.request.get(url, {
    headers: { Accept: "application/json" },
    timeout: OAKVALLEY.timeouts.rates,
  });
  if (!res.ok()) throw new Error(`${url} HTTP ${res.status()}`);
  const body = (await res.json()) as { data?: T };
  return body.data ?? null;
}
