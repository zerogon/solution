import { addDaysUtc, parseDate, toIsoDate } from "@/lib/utils";
import type { CrawlerContext } from "../types";
import { KENSINGTON, type KensingtonBranch } from "./config";
import { parseSummaryTotal, type KensingtonRow } from "./parse";

/**
 * 행마다 `quick_set_summary`(예약 요약)를 물어 숙박 총액을 붙인다 — **최신화 전용**.
 *
 * 사이트가 객실을 고르면 띄우는 요약이 `객실요금 합계`와 날짜별 요금을 준다
 * (설악비치 11/13~15: 금 169,000 + 토 179,000 = 348,000, 2026-10-18). `pack_cd=""`는
 * 패키지 없는 기본 분양회원 요금이고, 요금 플랜 콜(`subpack`)을 먼저 부르지 않아도 답한다.
 * 사이트가 그 방·그 숙박에 견적한 값이므로 종류는 `member`다.
 *
 * 비용이 이 함수를 최신화로 가둔다: 방마다 1콜 ~0.75초이고 회원 세션이라 **순차만** 된다
 * (`search.ts` 머리 주석의 세션 잠금). 지점 하나(~10실)는 ~8초지만 정기 수집의 한 윈도우
 * (~83실)는 ~60초다. 게이트는 `search.ts`의 `wantsPrices`.
 *
 * 전부 삼킨다. 재고는 이미 받았고, 요금 실패는 그 행의 빈칸이어야지 재고 행의 전멸이면
 * 안 된다. 세션을 잃은 것(3xx)도 여기서는 던지지 않고 멈춘다 — 다음 크롤의
 * `validateSession`이 처리한다.
 */
export async function attachPrices(
  ctx: CrawlerContext,
  branch: KensingtonBranch,
  rows: KensingtonRow[],
  stay: { checkin: string; checkout: string; membNo: string },
): Promise<void> {
  const nights = nightsOf(stay.checkin, stay.checkout);
  let priced = 0;
  let slowestMs = 0;
  let stopped: string | null = null;

  for (const { code, row } of rows) {
    const left = ctx.deadlineAt - Date.now() - KENSINGTON.timeouts.returnReserve;
    if (left < Math.max(slowestMs, 1_000)) {
      stopped = "budget";
      break;
    }
    const startedAt = Date.now();
    try {
      const res = await ctx.page.request.get(KENSINGTON.summaryUrl, {
        params: {
          search_bran_cd: branch.branCd,
          search_stay_start_dt: stay.checkin,
          search_stay_end_dt: stay.checkout,
          search_room_cnt: "1",
          search_people_adult_cnt: "2",
          search_people_adult_cnts: "2",
          search_people_child_cnt: "0",
          search_people_child_cnts: "0",
          search_code_type: "",
          search_code: "",
          pack_cd: "",
          room_type_cd: code,
          memb_no: stay.membNo,
          pay_type: KENSINGTON.payType,
        },
        headers: {
          Referer: KENSINGTON.memberPageUrl,
          "X-Requested-With": "XMLHttpRequest",
        },
        maxRedirects: 0,
        timeout: Math.max(1_000, Math.min(KENSINGTON.timeouts.api, left)),
      });
      const status = res.status();
      if (status >= 300 && status < 400) {
        stopped = `session ${status}`;
        break;
      }
      if (res.ok()) {
        const total = parseSummaryTotal(await res.text(), nights);
        if (total != null) {
          row.price = { amount: total, kind: "member" };
          priced++;
        }
      }
    } catch (e) {
      ctx.log("[kensington] price call failed", {
        branch: branch.value,
        code,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    slowestMs = Math.max(slowestMs, Date.now() - startedAt);
  }

  ctx.log("[kensington] prices", {
    branch: branch.value,
    rows: rows.length,
    priced,
    slowestMs,
    ...(stopped ? { stopped } : {}),
  });
}

/** `["2026-11-13", "2026-11-14"]` — 체크아웃 날은 밤이 아니다. */
function nightsOf(checkin: string, checkout: string): string[] {
  const out: string[] = [];
  for (let d = parseDate(checkin); toIsoDate(d) < checkout; d = addDaysUtc(d, 1)) {
    out.push(toIsoDate(d));
  }
  return out;
}
