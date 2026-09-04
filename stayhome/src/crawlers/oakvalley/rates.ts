import type { Page } from "playwright-core";
import { addDaysUtc, toIsoDate } from "@/lib/utils";
import type { CrawlerContext } from "../types";
import { OAKVALLEY } from "./config";

/**
 * 공표된 회원 요금표를 재고 행에 붙인다.
 *
 * 이 사이트의 예약 API에는 금액이 없다(위 `keys` 조사). 그런데 마케팅 API
 * `GET api.oakvalley.co.kr/api/v1/village`가 **무인증으로** 빌리지마다
 * `roomPriceTable`을 주고, 거기에 회원 요금표와 **시즌 달력 자체**가 HTML로 들어 있다.
 * 그래서 여기서 나오는 숫자는 사이트가 그 숙박에 대해 견적한 값이 아니라
 * **우리가 계산한 값**이고, `PriceKind`가 그것을 `memberTable`로 구별한다.
 *
 * 이 파일의 규칙은 하나다 — **모르면 만들지 않는다.** 표의 형태가 기대와 조금이라도
 * 다르면 금액을 0개 만든다. 표는 개정되고 개정은 우리에게 통보되지 않으므로, 조용히
 * 틀린 금액을 발행하는 것보다 빈칸이 낫다(이 저장소의 규약이고, 여기서는 특히 그렇다:
 * 재고와 달리 요금은 담당자가 직원에게 그대로 전달한다).
 */

/** 요금표 한 줄이 주는 7개 값의 자리. 표의 열 순서가 곧 이 순서다. */
const OFF_WEEK = 0;
const OFF_FRI = 1;
const OFF_SAT = 2;
const PEAK_WEEK = 3;
const PEAK_FRI = 4;
const PEAK_SAT = 5;
const SPECIAL = 6;
const RATE_CELLS = 7;

interface DateRange {
  from: string;
  to: string;
}

export interface RateBook {
  /** 빌리지명 → 요금표 줄 이름 → 7개 값(원). `OAKVALLEY.rateFare` 열만 담는다. */
  villages: Map<string, Map<string, number[]>>;
  peak: DateRange[];
  special: DateRange[];
  /** 요일과 무관하게 토요일 요금을 받는 날. */
  saturdays: Set<string>;
  /** 달력을 어느 빌리지의 표에서 읽었는지 — 아래 "달력은 리조트 전체" 주석 참조. */
  calendarFrom: string;
}

/**
 * 패스당 한 번만 받는다. `ctx.page`로 키잉해 페이지와 함께 죽게 하는 것은
 * `hanwha/search.ts`의 `booted`와 같은 이유다 — 모듈 캐시로 두면 다음 크롤이
 * 이미 없는 브라우저의 표를 물려받는다.
 */
const books = new WeakMap<Page, RateBook | null>();

export async function loadRateBook(ctx: CrawlerContext): Promise<RateBook | null> {
  const { page, log } = ctx;
  if (books.has(page)) return books.get(page) ?? null;

  let book: RateBook | null = null;
  try {
    const res = await page.request.get(OAKVALLEY.villageApiUrl, {
      headers: { Accept: "application/json" },
      timeout: OAKVALLEY.timeouts.rates,
    });
    if (!res.ok()) throw new Error(`village API HTTP ${res.status()}`);
    const body = (await res.json()) as {
      data?: Array<{ introduceTitle?: string | null; roomPriceTable?: string | null }>;
    };
    book = buildRateBook(body.data ?? []);
  } catch (e) {
    // 절대 던지지 않는다: 이건 부가 정보이고, `run.ts`가 `searchAvailability` 전체를
    // 하나의 deadline으로 감싸므로 여기서 새어 나간 예외는 그 지점의 재고 행 전부를
    // 잃게 만든다.
    log("[oakvalley] 요금표를 읽지 못함 — 요금 없이 진행", {
      error: e instanceof Error ? e.message : String(e),
    });
  }

  if (book) {
    log("[oakvalley] 요금표 적재", {
      villages: [...book.villages.keys()],
      rows: [...book.villages.values()].reduce((n, m) => n + m.size, 0),
      peakRanges: book.peak.length,
      specialRanges: book.special.length,
      saturdays: book.saturdays.size,
      calendarFrom: book.calendarFrom,
    });
  }
  books.set(page, book);
  return book;
}

export function buildRateBook(
  data: Array<{ introduceTitle?: string | null; roomPriceTable?: string | null }>,
): RateBook | null {
  const villages = new Map<string, Map<string, number[]>>();
  let calendar: { peak: DateRange[]; special: DateRange[]; saturdays: Set<string> } | null = null;
  let calendarFrom = "";

  for (const v of data) {
    const title = v.introduceTitle?.trim();
    const html = v.roomPriceTable ?? "";
    if (!title || !html) continue;

    const rows = parseRates(html);
    if (rows.size) villages.set(title, rows);

    const cal = parseCalendar(html);
    if (!cal) continue;
    if (calendar) {
      // 두 빌리지가 서로 다른 달력을 공표하면 어느 쪽이 맞는지 알 수 없다. 그때는
      // 고르지 않는다 — 이 분기가 도는 것 자체가 아래 "리조트 전체" 가정이 깨졌다는
      // 뜻이고, 그 사실을 조용한 오답이 아니라 빈칸으로 드러내야 한다.
      if (JSON.stringify(cal) !== JSON.stringify(calendar)) return null;
      continue;
    }
    calendar = cal;
    calendarFrom = title;
  }

  if (!villages.size || !calendar) return null;
  return { villages, ...calendar, calendarFrom };
}

/**
 * 요금표 줄들. rowspan을 펴지 않고 셀 수로 읽는다.
 *
 * 관측된 형태(2026-08-26): 기명 줄은 `[객실타입, 요금구분, 정상가, …7]` = 10셀이고,
 * 그 아래 무기명·회원대여가 줄은 객실타입과 정상가가 rowspan으로 묶여 빠져
 * `[요금구분, …7]` = 8셀이다. 그래서 10셀 줄이 나올 때마다 현재 객실타입이 바뀐다.
 * 빌리지 하나에 `<table>`이 여러 개이므로 전부 훑는다.
 */
function parseRates(html: string): Map<string, number[]> {
  const out = new Map<string, number[]>();
  let current: string | null = null;

  for (const tr of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = rowCells(tr[1]);
    let fare: string | undefined;
    let values: string[] | undefined;

    if (cells.length === RATE_CELLS + 3) {
      current = cells[0];
      fare = cells[1];
      values = cells.slice(3);
    } else if (cells.length === RATE_CELLS + 1) {
      fare = cells[0];
      values = cells.slice(1);
    } else {
      continue;
    }
    if (!current) continue;
    // 힐스 48평의 "회원대여"처럼 원문에 오타가 있어 접두사로 맞춘다. 우리가 쓰는
    // 것은 `기명` 하나이지만, 이 느슨함이 없으면 다른 줄에서 조용히 밀린다.
    if (!fare?.startsWith(OAKVALLEY.rateFare)) continue;

    const nums = values.map(toWon);
    if (nums.some((n) => n == null)) continue;
    out.set(current, nums as number[]);
  }
  return out;
}

/**
 * 시즌 달력. 관측된 형태는 `[구분, 기간, 비고]` 3셀 줄이고, 스페셜 데이만
 * 구분 셀이 rowspan으로 묶여 뒤따르는 줄이 `[기간, 비고]` 2셀이다.
 *
 * **비수기는 읽지 않는다** — 성수기도 스페셜도 아닌 날이 비수기이므로, 세 목록을
 * 다 읽으면 서로 모순될 수 있는 사본이 셋이 된다. 읽는 것은 "비수기가 아닌 날"뿐이다.
 */
function parseCalendar(
  html: string,
): { peak: DateRange[]; special: DateRange[]; saturdays: Set<string> } | null {
  const peak: DateRange[] = [];
  const special: DateRange[] = [];
  let inSpecial = false;
  let sawCalendar = false;

  for (const tr of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = rowCells(tr[1]);
    let label: string | null = null;
    let periods: string | null = null;

    if (cells.length === 3) {
      label = cells[0];
      periods = cells[1];
    } else if (cells.length === 2 && inSpecial) {
      periods = cells[0];
    } else {
      continue;
    }

    if (label && /성수기/.test(label)) {
      inSpecial = false;
      sawCalendar = true;
      peak.push(...parseRanges(periods));
    } else if (label && /스페셜/.test(label)) {
      inSpecial = true;
      sawCalendar = true;
      special.push(...parseRanges(periods));
    } else if (label && /비수기/.test(label)) {
      inSpecial = false;
      sawCalendar = true;
    } else if (!label && inSpecial) {
      special.push(...parseRanges(periods));
    } else {
      inSpecial = false;
    }
  }

  if (!sawCalendar) return null;
  // 달력을 실은 표라면 성수기와 스페셜 데이가 둘 다 있어야 한다. 하나라도 비면
  // 형태가 우리가 아는 것과 다른 것이고, 그 위에서 날짜를 판정하면 안 된다.
  if (!peak.length || !special.length) return null;

  const saturdays = parseSaturdays(html);
  if (saturdays == null) return null;
  return { peak, special, saturdays };
}

/**
 * "토요일 요금 적용 일자" 목록. 표 밖의 산문이라 이 파일에서 가장 무른 부분이다.
 *
 * 관측: `※ 토요일 요금 적용 일자` 다음 줄에
 * `2026년 3/1(일), 5/3(일)~5/4(월), 5/24(일), 10/4(일), 10/9(금), 12/24(목), 12/31(목)`.
 *
 * 문구가 있는데 한 날짜도 못 읽으면 **`null`을 돌려 요금 전체를 포기한다.** 이 목록을
 * 놓치면 그 날들만 조용히 싼 값이 나가고, 그건 하필 사람이 가장 많이 예약하는 날이다.
 */
function parseSaturdays(html: string): Set<string> | null {
  const text = html
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  const marker = text.search(/토요일\s*요금\s*적용/);
  if (marker < 0) return new Set();

  const after = text.slice(marker, marker + 600);
  const year = after.match(/(\d{4})\s*년/)?.[1];
  if (!year) return null;

  const out = new Set<string>();
  // `M/D(요일)` 또는 `M/D(요일)~M/D(요일)`.
  for (const m of after.matchAll(
    /(\d{1,2})\/(\d{1,2})\s*\([^)]*\)\s*(?:~\s*(\d{1,2})\/(\d{1,2})\s*\([^)]*\))?/g,
  )) {
    const from = `${year}-${pad(m[1])}-${pad(m[2])}`;
    const to = m[3] ? `${year}-${pad(m[3])}-${pad(m[4])}` : from;
    for (const iso of eachDay(from, to)) out.add(iso);
  }
  return out.size ? out : null;
}

/** `2026.02.22 (일) ~ 2026.07.16 (목)`가 여러 개 이어 붙어 있는 셀을 편다. */
function parseRanges(text: string | null): DateRange[] {
  if (!text) return [];
  const out: DateRange[] = [];
  for (const m of text.matchAll(
    /(\d{4})\.(\d{1,2})\.(\d{1,2})\s*\([^)]*\)\s*(?:~\s*(\d{4})\.(\d{1,2})\.(\d{1,2})\s*\([^)]*\))?/g,
  )) {
    const from = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    const to = m[4] ? `${m[4]}-${pad(m[5])}-${pad(m[6])}` : from;
    out.push({ from, to });
  }
  return out;
}

/**
 * 그 숙박의 총액. 판정할 수 없는 밤이 하나라도 있으면 `null`.
 *
 * 밤마다 따로 판정해 더한다 — 시즌도 요일도 밤마다 다르고, 이 저장소의 `price` 계약이
 * "숙박 **전체**의 요금"이기 때문이다. 한 밤의 값에 박수를 곱하면 주말이 낀 숙박에서
 * 틀린다.
 */
export function stayRate(
  book: RateBook,
  village: string,
  rateRow: string,
  checkin: Date,
  nights: number,
): number | null {
  const rows = book.villages.get(village);
  const cells = rows?.get(rateRow);
  if (!cells || cells.length !== RATE_CELLS) return null;
  if (!Number.isFinite(nights) || nights < 1) return null;

  let total = 0;
  for (let i = 0; i < nights; i++) {
    const iso = toIsoDate(addDaysUtc(checkin, i));
    const idx = cellIndex(book, iso);
    if (idx == null) return null;
    const won = cells[idx];
    if (!Number.isFinite(won) || won <= 0) return null;
    total += won;
  }
  return total;
}

/** 그 하룻밤이 요금표의 어느 칸인가. 달력이 안 덮는 날짜면 `null`. */
function cellIndex(book: RateBook, iso: string): number | null {
  if (covers(book.special, iso)) return SPECIAL;

  const peak = covers(book.peak, iso);
  // 성수기도 스페셜도 아니면 비수기 — 다만 **달력의 사정권 안에 있을 때만** 그렇다.
  // 표가 덮지 않는 미래 날짜를 비수기로 읽으면, 아직 공표되지 않은 요금을 우리가
  // 지어내는 것이 된다.
  if (!peak && !withinHorizon(book, iso)) return null;

  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  const sat = day === 6 || book.saturdays.has(iso);
  const fri = !sat && day === 5;
  if (peak) return sat ? PEAK_SAT : fri ? PEAK_FRI : PEAK_WEEK;
  return sat ? OFF_SAT : fri ? OFF_FRI : OFF_WEEK;
}

/**
 * 달력이 말을 하는 구간인가.
 *
 * 성수기·스페셜 범위의 최소~최대로 잡는다. 비수기 범위를 따로 읽지 않는 대신
 * 이 울타리가 그 역할을 한다 — 표가 2027년 2월까지 말하고 있으면 그 안의 날짜만
 * "비수기"라고 부를 자격이 있다.
 */
function withinHorizon(book: RateBook, iso: string): boolean {
  const all = [...book.peak, ...book.special];
  if (!all.length) return false;
  const lo = all.reduce((a, r) => (r.from < a ? r.from : a), all[0].from);
  const hi = all.reduce((a, r) => (r.to > a ? r.to : a), all[0].to);
  return iso >= lo && iso <= hi;
}

function covers(ranges: DateRange[], iso: string): boolean {
  return ranges.some((r) => iso >= r.from && iso <= r.to);
}

function rowCells(tr: string): string[] {
  return [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
    c[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

/** `"77,000"` → `77000`. 숫자가 아니면 `null` — 빈 셀과 `-`를 걸러낸다. */
function toWon(s: string): number | null {
  if (!/^[\d,]+$/.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function pad(s: string): string {
  return s.padStart(2, "0");
}

function* eachDay(from: string, to: string): Generator<string> {
  let d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  // 뒤집힌 범위(오타)는 첫날만 내고 끝낸다 — 무한 루프를 만들지 않는다.
  if (end < d) {
    yield from;
    return;
  }
  while (d <= end) {
    yield toIsoDate(d);
    d = addDaysUtc(d, 1);
  }
}
