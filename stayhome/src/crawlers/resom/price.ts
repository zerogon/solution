import { addDaysUtc, toIsoDate } from "@/lib/utils";
import type { CrawlerContext, InventoryRow } from "../types";
import { RESOM, type ResomBranch } from "./config";
import { formatDateCompact } from "./format";
import { authHeaders, type ResomAuth, type ResomMember } from "./login";
import { roomTypeName, type CalendarEntry, type CalendarPayload } from "./parse";

/**
 * `GET {apiBase}/roomReservation/stockPrice` — 한 숙박의 회원 요금.
 *
 * 관측된 응답(2026-08-24, 실계정):
 * ```
 * {"rmAmtCd":"O12","rmAmtList":[{"oprtYmd":"20260907","rmAmt":252000}],"totalRmAmt":252000,
 *  "rentRmAmtCd":"O20","rentRmAmtList":[…],"totalRentRmAmt":316000,
 *  "rmAmtStndNm":"기본","totalCmpnyRmAmt":0,"totalCmpnyRentRmAmt":0,"isPossible":true}
 * ```
 */
interface StockPriceResponse {
  /** 그 숙박 **전체**의 객실 요금. 예약 불가면 null. */
  totalRmAmt?: number | null;
  /** 밤별 내역. `oprtYmd`는 압축 날짜. */
  rmAmtList?: Array<{ oprtYmd?: string; rmAmt?: number }> | null;
  /** 회원카드 대여 시의 요금. 우리는 `rentYn:"N"`으로 묻는다. */
  totalRentRmAmt?: number | null;
  /** 회사지원금. 0이 아니면 `totalRmAmt`는 직원이 낼 금액이 아니다 — 아래 참조. */
  totalCmpnyRmAmt?: number | null;
  /** 사이트 자신의 "이 숙박 팔 수 있나" 판정. */
  isPossible?: boolean;
  message?: string | null;
}

export interface AttachPricesInput {
  payload: CalendarPayload;
  rows: InventoryRow[];
  branch: ResomBranch;
  checkin: Date;
  nights: number;
  auth: ResomAuth;
  member: ResomMember;
}

/**
 * 요청한 그 숙박의 행들에만 회원 요금을 붙인다.
 *
 * ## 왜 여기만인가
 *
 * 리솜은 요금을 재고 응답에 싣지 않는다. `calendarRooms`의 `rmAmt`는 506행 전부
 * 문자열 `"0"`이고(유효한 건 요금 코드뿐), 실제 값은 SPA가 **사용자가 객실을 클릭할 때**
 * 한 번 부르는 `stockPrice`에 있다. 즉 행 하나에 콜 하나다. 45일 × 객실유형을 전부
 * 물으면 1,500콜이라 정기 수집 예산에 들어갈 수 없고, 그래서 이 함수는 사용자가
 * "최신화"로 지목한 **한 날짜**의 행만 다룬다 — 그때는 십여 콜이고, 사용자는 이미
 * 그 요청을 기다리고 있다.
 *
 * ## 절대 던지지 않는다
 *
 * `run.ts`가 `searchAvailability` 전체를 하나의 `withDeadline`으로 감싸고 그것이
 * reject하므로, 여기서 던지거나 시간을 넘기면 잃는 것은 요금이 아니라 **이미 모아둔
 * 그 지점 45일치 행 전부와 SUCCESS 판정**이다. 부가 정보를 얻으려다 본체를 잃는
 * 거래는 성립하지 않는다. 그래서 개별 실패도 전체 초과도 조용히 "요금 없음"으로
 * 끝난다 — 없는 요금은 화면에서 빈칸이다.
 *
 * @returns 요금을 붙인 행 수
 */
export async function attachPrices(
  ctx: CrawlerContext,
  input: AttachPricesInput,
): Promise<number> {
  const { payload, rows, branch, checkin, nights, auth, member } = input;
  const { log } = ctx;

  const ciYmd = formatDateCompact(checkin);
  const checkoutIso = toIsoDate(addDaysUtc(checkin, nights));

  // 요청한 날짜의 달력 엔트리. 이 날짜 하나만 보는 덕에 `ciYmd`가 "엔트리 자신의
  // 날짜"인지 "요청 값의 에코"인지 몰라도 결과가 같다 — 어느 해석에서든 이 목록은
  // 그 날짜의 것이다.
  const entries = (payload?.[ciYmd] ?? []) as CalendarEntry[];
  if (entries.length === 0) {
    log("[resom] no calendar entries for the requested date, skipping prices", {
      branch: branch.value,
      ciYmd,
    });
    return 0;
  }

  // 이름 → 엔트리. 같은 이름이 둘 이상이면 **버린다**: 파서가 그 둘을 한 행으로
  // OR 병합하므로(parse.ts) 어느 쪽 요금인지 말할 수 없고, 증상은 "요금만 틀림"이라
  // 화면에서 구별되지 않는다.
  const byName = new Map<string, CalendarEntry | null>();
  for (const entry of entries) {
    const name = roomTypeName(entry);
    if (!name) continue;
    byName.set(name, byName.has(name) ? null : entry);
  }

  // 요청한 숙박의, 예약 가능한 행만. 예약할 수 없는 방의 가격은 정보가 아니라 잡음이고
  // 사이트도 그 경우 `isPossible:false`에 금액을 null로 답한다.
  //
  // 정렬은 화면(`BranchResultSection`)과 같은 객실명 순서. 예산에 끊길 때 잘리는 쪽이
  // 목록 아래로 몰리고, 같은 화면을 두 번 최신화해도 같은 방에 요금이 붙는다 —
  // 비결정적 결손은 "왜 이 방만 요금이 없지"로 나타나고 진단이 불가능하다.
  const targets = rows
    .filter(
      (r) =>
        r.available &&
        r.stay != null &&
        toIsoDate(r.stay.checkin) === toIsoDate(checkin) &&
        toIsoDate(r.stay.checkout) === checkoutIso,
    )
    .sort((a, b) => a.roomType.localeCompare(b.roomType, "ko"))
    .slice(0, RESOM.priceMaxRooms);

  if (targets.length === 0) return 0;

  const startedAt = Date.now();
  // 두 시계 중 먼저 오는 쪽. `deadlineAt`은 넘기면 재고를 잃는 진짜 한계이고,
  // `priceMaxMs`는 "여유가 있어도 사용자를 오래 세워두지 않는다"는 별개의 판단이다.
  const stopAt = Math.min(startedAt + RESOM.priceMaxMs, ctx.deadlineAt - RETURN_RESERVE_MS);

  let priced = 0;
  let slowestMs = 0;
  let truncated = false;
  let mismatched = 0;
  let rejected = 0;

  for (const row of targets) {
    // 시작해도 되는지는 "이 콜이 최악으로 걸릴 시간"으로 판단한다. 남은 시간이
    // 한 콜의 타임아웃보다 짧으면 시작 자체가 도박이다.
    if (Date.now() + RESOM.timeouts.price > stopAt) {
      truncated = true;
      break;
    }

    const entry = byName.get(row.roomType);
    if (!entry) continue; // 이름 충돌이거나 달력에 없는 행

    const callStart = Date.now();
    let result: StockPriceResponse | null;
    try {
      result = await fetchStockPrice(ctx, { entry, branch, ciYmd, nights, auth, member });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 401/403/429는 이 패스에서 회복되지 않는다. 계속 두드리면 예산만 태우고
      // 실계정에 실패가 쌓인다(반복 로그인 실패는 잠금 위험).
      if (/\b(401|403|429)\b/.test(msg)) {
        log("[resom] price call rejected, stopping", { branch: branch.value, error: msg });
        break;
      }
      log("[resom] price call failed", { branch: branch.value, roomType: row.roomType, error: msg });
      continue;
    } finally {
      slowestMs = Math.max(slowestMs, Date.now() - callStart);
    }

    const amount = readAmount(result, { ciYmd, nights });
    if (amount == null) {
      if (result?.isPossible === false) mismatched++;
      else rejected++;
      continue;
    }
    row.price = { amount, kind: "member" };
    priced++;
  }

  log("[resom] prices attached", {
    branch: branch.value,
    ciYmd,
    nights,
    priced,
    candidates: targets.length,
    elapsedMs: Date.now() - startedAt,
    slowestMs,
    ...(truncated ? { truncated: true } : {}),
    // 사이트가 "이 숙박은 못 판다"고 답했는데 우리 행은 예약 가능이라고 말한 수.
    // 요금 문제가 아니라 **파서와 사이트의 가용성 판정이 어긋난 것**이고, 리솜
    // 가용성은 밤별 상태를 우리가 AND 한 추론이라 지금까지 대조할 방법이 없었다.
    // 이 저장소는 그 추론에서 두 번 틀린 적이 있다(소노 08-09, 한화 08-13).
    ...(mismatched ? { availableButSiteSaysNo: mismatched } : {}),
    ...(rejected ? { rejectedByValidation: rejected } : {}),
  });

  return priced;
}

/**
 * 반환 경로를 위해 남겨두는 시간.
 *
 * upsert는 `withDeadline` 밖이라(그리고 `runResortCrawl`의 50초와 `maxDuration` 60초
 * 사이에 여유가 있다) 여기서 예약할 필요가 없다. 이 값이 덮는 것은 마지막 콜이 끝나고
 * 행을 돌려주기까지다.
 */
const RETURN_RESERVE_MS = 3_000;

async function fetchStockPrice(
  ctx: CrawlerContext,
  args: {
    entry: CalendarEntry;
    branch: ResomBranch;
    ciYmd: string;
    nights: number;
    auth: ResomAuth;
    member: ResomMember;
  },
): Promise<StockPriceResponse> {
  const { entry, ciYmd, nights, auth, member } = args;

  // SPA는 사용자가 클릭한 달력 엔트리를 통째로 복사해 보낸다. 그대로 흉내 내되
  // 두 값은 반드시 우리가 정한다.
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(entry)) {
    if (v === null || v === undefined || typeof v === "object") continue;
    query.set(k, String(v));
  }
  query.set("memNo", member.memNo);
  query.set("memInd", member.memInd);
  query.set("nights", String(nights));
  query.set("rmCnt", String(RESOM.roomCount));
  // (1) `ciYmd`는 엔트리에서 베끼지 않고 요청 날짜로 명시한다.
  query.set("ciYmd", ciYmd);
  // (2) 엔트리의 `coYmd`는 45일 **요청 span**의 끝이다. 그대로 보내면 46박 요금을
  //     계산해 돌려준다 — 에러 없이, 그럴듯한 큰 숫자로.
  query.set(
    "coYmd",
    formatDateCompact(addDaysUtc(new Date(`${isoFromCompact(ciYmd)}T00:00:00.000Z`), nights)),
  );
  for (const [k, v] of Object.entries(RESOM.priceRequest)) query.set(k, v);

  const res = await ctx.page.request.get(
    `${RESOM.apiBase}/roomReservation/stockPrice?${query.toString()}`,
    { timeout: RESOM.timeouts.price, headers: authHeaders(auth) },
  );
  if (!res.ok()) {
    // 400은 필요한 필드 이름을 한국어로 알려준다 — 조사에서 `isWait`/`rentYn`이
    // 그렇게 드러났다. 메시지를 통째로 남긴다.
    throw new Error(`stockPrice ${res.status()}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as StockPriceResponse;
}

/**
 * 응답에서 발행해도 되는 금액만 꺼낸다. 아니면 null.
 *
 * "성공한 응답"이 "우리가 물은 것에 대한 답"의 증거가 되지 못하는 사이트들을 이미
 * 겪었다(오크밸리는 어느 달을 물어도 같은 달을 `success:true`로 답했다). 여기서도
 * 같은 자세로, 공짜인 검사를 전부 한다.
 */
function readAmount(
  res: StockPriceResponse | null,
  want: { ciYmd: string; nights: number },
): number | null {
  if (!res) return null;

  // 사이트 자신이 못 판다고 답했다.
  if (res.isPossible !== true) return null;

  const total = res.totalRmAmt;
  if (typeof total !== "number" || !Number.isFinite(total) || total <= 0) return null;

  // 회사지원금이 붙는 순간 `totalRmAmt`는 **직원이 낼 금액이 아니다** — 사이트는 그
  // 화면에서 "임직원 결제 금액 = 객실요금 − 지원금"을 따로 그린다. 우리는 지원금을
  // 저장하지 않으므로 화면이 자기가 틀렸다는 걸 알 방법이 없다. 관측된 계정은 0이라
  // 이 가지는 오늘 무동작이고, 0이 아니게 되는 날 필요한 건 라벨이 아니라 컬럼이다.
  if (typeof res.totalCmpnyRmAmt === "number" && res.totalCmpnyRmAmt !== 0) return null;

  // 밤별 내역이 우리가 물은 숙박과 같은지. 하나라도 어긋나면 그건 **다른 숙박의 요금**이다.
  const nightly = res.rmAmtList;
  if (!Array.isArray(nightly) || nightly.length !== want.nights) return null;
  if (nightly[0]?.oprtYmd !== want.ciYmd) return null;
  const sum = nightly.reduce((acc, n) => acc + (typeof n.rmAmt === "number" ? n.rmAmt : NaN), 0);
  if (!Number.isFinite(sum) || sum !== total) return null;

  return total;
}

/** "20260907" → "2026-09-07". */
function isoFromCompact(ymd: string): string {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}
