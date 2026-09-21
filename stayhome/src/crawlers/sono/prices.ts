import { addDaysUtc, toIsoDate } from "@/lib/utils";
import type { InventoryVariant } from "@/lib/variants";
import type { CrawlerContext, InventoryRow } from "../types";
import { SONO, type SonoBranch } from "./config";
import { formatDateCompact } from "./format";

/**
 * `POST {apiBase}/memberReservation/room/detail/price` — 한 변형 · 한 숙박의 회원 요금.
 *
 * 관측된 응답(2026-09-21, 실계정, 소노벨 청송 `00I00212` 2026-10-05 1박):
 * ```
 * {"dcAmt":0,"levelAmt":25000,"totAmt":146000,"originAmt":171000,
 *  "preAftPayAmt":146000,"longSbscrbAmt":null,"speclBnftAmt":null,
 *  "benefitDiscountList":[],"dailyPreAftPayList":[],
 *  "daysAmtInfoList":[{"stndYmd":"20261005","totAmt":171000,"levelAmt":25000,"dcAmt":null,"seasonCd":"41"}]}
 * ```
 */
interface PriceResponse {
  success?: boolean;
  error?: unknown;
  body?: {
    /** 그 숙박 **전체**의 회원 요금. 할인이 이미 반영된 값이다. */
    totAmt?: number | null;
    /** 할인 전 금액. `originAmt - levelAmt = totAmt`가 실측으로 성립한다. */
    originAmt?: number | null;
    /** 회원 등급 할인. 날짜에 따라 0이 되기도 한다(실측 ci+30). */
    levelAmt?: number | null;
    dcAmt?: number | null;
    /**
     * 밤별 내역. ⚠️ **여기 `totAmt`는 할인 전 금액이다** — 합하면 `originAmt`이지
     * `body.totAmt`가 아니다(1박 실측 171,000 vs 146,000). 그래서 이 배열은 금액의
     * 출처가 아니라 **우리가 물은 숙박이 맞는지 확인하는 자료**로만 쓴다.
     */
    daysAmtInfoList?: Array<{ stndYmd?: string; totAmt?: number | null; seasonCd?: string }> | null;
  } | null;
}

export interface AttachVariantPricesInput {
  memNo: string;
  branch: SonoBranch;
  /** 이 패스가 만든 행 전부. 요청한 숙박의 것만 골라 쓴다. */
  rows: InventoryRow[];
  checkin: Date;
  nights: number;
}

/**
 * 요청한 그 숙박의 **변형마다** 회원 요금을 붙인다.
 *
 * ## 왜 행이 아니라 변형인가
 *
 * 사이트가 그렇게 답한다. `room/detail/price`는 `rmTypeCd`(= 변형) 하나를 묻고,
 * 이 크롤러의 행은 변형을 여럿 접은 것이다(실측 570그룹 중 300개). 같은 행의 변형끼리
 * 요금이 다르므로 행에 하나를 고르면 나머지는 틀린 값이 된다. 2026-09-11에 생긴
 * `variants` 컬럼이 이 값을 놓을 자리이고, 행의 `price`는 비워 둔다.
 *
 * ## 왜 최신화 경로에만 있는가
 *
 * `storeCd`·`rmTypeCd`가 단수라 배치가 **구조적으로** 불가능하다(배열을 주면 500
 * `Cannot deserialize value of type java.lang.String from Array`, `storeCdList`는 무시).
 * 즉 변형 하나에 콜 하나이고 실측 166ms다. 핫 윈도우 전체는 ~30,000콜 ≈ 80분이라
 * 패스 예산 밖이고, 사용자가 지목한 (지점 1 · 윈도우 1)은 2.6초다 — 리솜 요금과
 * 같은 결론에 같은 이유로 도달했다.
 *
 * ## 절대 던지지 않는다
 *
 * `run.ts`가 `searchAvailability` 전체를 하나의 `withDeadline`으로 감싸므로, 여기서
 * 던지거나 시간을 넘기면 잃는 것은 요금이 아니라 **이미 모아둔 그 지점 한 달치 행
 * 전부와 SUCCESS 판정**이다. 개별 실패도 전체 초과도 조용히 "요금 없음"으로 끝난다.
 *
 * @returns 요금을 붙인 변형 수
 */
export async function attachVariantPrices(
  ctx: CrawlerContext,
  input: AttachVariantPricesInput,
): Promise<number> {
  const { memNo, branch, rows, checkin, nights } = input;
  const { log } = ctx;

  const ciYmd = formatDateCompact(checkin);
  const coYmd = formatDateCompact(addDaysUtc(checkin, nights));
  const checkinIso = toIsoDate(checkin);
  const checkoutIso = toIsoDate(addDaysUtc(checkin, nights));

  // 요청한 숙박의 행만. 이 크롤러의 응답은 **그 달 전체**라 `rows`에는 30일치가 들어
  // 있고, 그 전부에 요금을 물으면 한 최신화가 수백 콜이 된다.
  //
  // 그리고 **예약할 수 있는 변형만.** 사이트는 마감임박·예약대기 변형에도 금액을
  // 답하지만(실측 대기 392,000원) 응답에 리솜 `isPossible` 같은 자기 부인 칸이 없어서,
  // 가용성 게이트는 우리 쪽에 있어야 한다.
  //
  // 정렬은 화면(`BranchResultSection`)과 같은 객실명 순서 — 예산에 끊길 때 잘리는 쪽이
  // 목록 아래로 몰리고, 같은 화면을 두 번 최신화해도 같은 변형에 요금이 붙는다.
  const targets: Array<{ roomType: string; variant: InventoryVariant }> = [];
  for (const row of [...rows].sort((a, b) => a.roomType.localeCompare(b.roomType, "ko"))) {
    if (!row.available || !row.stay || !row.variants) continue;
    if (toIsoDate(row.stay.checkin) !== checkinIso) continue;
    if (toIsoDate(row.stay.checkout) !== checkoutIso) continue;
    for (const variant of row.variants) {
      if (!variant.available || !variant.code) continue;
      targets.push({ roomType: row.roomType, variant });
    }
  }
  if (targets.length === 0) return 0;

  const capped = targets.slice(0, SONO.prices.maxVariants);
  const startedAt = Date.now();
  // 두 시계 중 먼저 오는 쪽(리솜 `price.ts`와 같은 규칙).
  const stopAt = Math.min(startedAt + SONO.prices.maxMs, ctx.deadlineAt - SONO.prices.returnReserveMs);

  /** 같은 `rmTypeCd`를 두 번 묻지 않는다. 행이 달라도 코드가 같으면 같은 예약 단위다. */
  const seen = new Map<string, number | null>();
  let priced = 0;
  let slowestMs = 0;
  let truncated = false;
  let rejected = 0;

  for (const { variant } of capped) {
    const cached = seen.get(variant.code);
    if (cached !== undefined) {
      if (cached != null) {
        variant.price = { amount: cached, kind: "member" };
        priced++;
      }
      continue;
    }

    // 시작해도 되는지는 "이 콜이 최악으로 걸릴 시간"으로 본다. 남은 시간이 한 콜의
    // 타임아웃보다 짧으면 시작 자체가 도박이다.
    if (Date.now() + SONO.timeouts.price > stopAt) {
      truncated = true;
      break;
    }

    const callStart = Date.now();
    let res: PriceResponse | null = null;
    try {
      res = await fetchVariantPrice(ctx, { memNo, branch, code: variant.code, ciYmd, coYmd, nights });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 401/403/429는 이 패스에서 회복되지 않는다. 계속 두드리면 예산만 태운다.
      if (/\b(401|403|429)\b/.test(msg)) {
        log("[sono] price call rejected, stopping", { branch: branch.value, error: msg });
        break;
      }
      log("[sono] price call failed", { branch: branch.value, code: variant.code, error: msg });
      seen.set(variant.code, null);
      continue;
    } finally {
      slowestMs = Math.max(slowestMs, Date.now() - callStart);
    }

    const amount = readAmount(res, { ciYmd, nights });
    seen.set(variant.code, amount);
    if (amount == null) {
      rejected++;
      continue;
    }
    variant.price = { amount, kind: "member" };
    priced++;
  }

  log("[sono] variant prices attached", {
    branch: branch.value,
    ciYmd,
    nights,
    priced,
    candidates: targets.length,
    calls: seen.size,
    elapsedMs: Date.now() - startedAt,
    slowestMs,
    ...(truncated ? { truncated: true } : {}),
    // 200을 받았는데 발행하지 못한 수. 0이 아니면 응답 모양이 우리가 읽는 것과
    // 어긋났다는 뜻이고, 증상은 에러가 아니라 "요금이 안 보임"이다.
    ...(rejected ? { rejectedByValidation: rejected } : {}),
    ...(targets.length > capped.length ? { cappedAt: capped.length } : {}),
  });

  return priced;
}

async function fetchVariantPrice(
  ctx: CrawlerContext,
  args: {
    memNo: string;
    branch: SonoBranch;
    code: string;
    ciYmd: string;
    coYmd: string;
    nights: number;
  },
): Promise<PriceResponse> {
  const { memNo, branch, code, ciYmd, coYmd, nights } = args;

  const res = await ctx.page.request.post(
    `${SONO.apiBase}/memberReservation/room/detail/price?lang=ko&deviceType=PC&mobileAppYn=N`,
    {
      timeout: SONO.timeouts.price,
      headers: {
        "content-type": "application/json",
        Accept: "application/json",
        Referer: SONO.bookingUrl,
      },
      data: {
        // 단수다. 배열을 주면 500이고 `storeCdList`는 무시된다 — 이 엔드포인트가
        // `room/detail`(배치형)과 갈리는 지점이고, 그래서 비용이 변형당 1콜이다.
        storeCd: branch.storeCd,
        rmTypeCd: code,
        memNo,
        // `names.ts`의 그 칸. 빼면 `W22M3S4 이용회원번호는 필수입니다`.
        actualMemNo: memNo,
        userIndCd: SONO.request.userIndCd,
        rsvIndCd: SONO.request.rsvIndCd,
        ciYmd,
        coYmd,
        nights,
        rmCnt: SONO.request.rmCnt,
        adultCnt: SONO.request.adultCnt,
        childCnt: SONO.request.childCnt,
      },
    },
  );
  if (!res.ok()) {
    // 400은 빠진 필드 이름을 한국어로 알려준다 — `storeCd`·`rmTypeCd`가 그렇게
    // 드러났다(2026-09-21 조사). 메시지를 통째로 남긴다.
    throw new Error(`detail/price ${res.status()}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as PriceResponse;
}

/**
 * 응답에서 발행해도 되는 금액만 꺼낸다. 아니면 null.
 *
 * "성공한 응답"이 "우리가 물은 것에 대한 답"의 증거가 되지 못하는 사이트들을 이미 겪었다
 * (오크밸리는 어느 달을 물어도 같은 달을 `success:true`로 답했다). 여기서도 공짜인 검사는
 * 전부 한다 — 특히 **밤 수와 첫 날짜**는 이 응답이 우리가 물은 숙박의 것인지를 말해준다.
 */
function readAmount(res: PriceResponse | null, want: { ciYmd: string; nights: number }): number | null {
  if (!res || res.success === false) return null;

  const body = res.body;
  if (!body) return null;

  const total = body.totAmt;
  if (typeof total !== "number" || !Number.isFinite(total) || total <= 0) return null;

  const days = body.daysAmtInfoList;
  if (!Array.isArray(days) || days.length !== want.nights) return null;
  if (days[0]?.stndYmd !== want.ciYmd) return null;

  // 밤별 합은 **할인 전** 금액이라 `originAmt`와 같아야 한다. 이 등식이 깨지면 우리가
  // 읽는 의미가 사이트의 의미와 달라진 것이고, 그때 필요한 것은 폴백이 아니라 재조사다.
  const origin = body.originAmt;
  if (typeof origin !== "number" || !Number.isFinite(origin)) return null;
  const nightly = days.reduce((acc, d) => acc + (typeof d.totAmt === "number" ? d.totAmt : NaN), 0);
  if (!Number.isFinite(nightly) || nightly !== origin) return null;

  // `originAmt - levelAmt = totAmt`(회원 등급 할인). 실측 1·2·3박과 ci+30(levelAmt 0)에서
  // 모두 성립했다. `dcAmt`는 관측 전부 0이라 이 산술에 들어가지 않는데, 0이 아닌 날이
  // 오면 등식이 깨져 **요금을 만들지 않는다** — 모르는 할인을 우리가 해석하는 것보다
  // 빈칸이 낫다는 이 저장소의 규약 그대로다.
  const level = typeof body.levelAmt === "number" && Number.isFinite(body.levelAmt) ? body.levelAmt : 0;
  if (origin - level !== total) return null;

  // ⚠️ 회사지원금(`companyAmt`)은 **이 응답에 없다** — 옆의 `detail/price-detail`이
  // 밤마다 준다(실측 0). 0이 아닌 계정에서는 `totAmt`가 직원이 낼 금액이 아니므로,
  // 리솜 `price.ts`가 `totalCmpnyRmAmt !== 0`일 때 요금을 붙이지 않는 것과 같은 판단이
  // 필요해진다. 그때 고칠 자리는 여기이고, 읽을 곳은 `price-detail`이다.
  return total;
}
