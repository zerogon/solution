import { mapPool } from "../_shared/pool";
import type { CrawlerContext, InventoryRow } from "../types";
import { KENSINGTON, type KensingtonBranch } from "./config";
import { parseOccupancy, type KensingtonRow } from "./parse";

/**
 * 객실 정보 팝업(`popup_room_info`)의 기준·최대 인원을 재고 행에 붙인다.
 *
 * 재고 조각에는 인원이 없다. 사이트가 객실명 옆 "객실 정보"를 누르면 띄우는 팝업이
 * **무인증으로** `(bran_cd, room_type_cd)`마다 인원을 준다(2026-10-18, 10지점 83유형 전부).
 *
 * **회원 세션 쿠키를 싣지 않는다.** 이 서버는 한 세션의 요청을 하나씩 처리하므로
 * (`search.ts` 머리 주석) `page.request`로 보내면 재고 콜 뒤에 줄을 선다. 쿠키 없는
 * `fetch`는 그 줄 밖이라 병렬이 실제로 빨라진다(10개 0.9초).
 *
 * 캐시는 페이지가 아니라 **모듈**에 둔다 — 오크밸리 `occupancy.ts`가 `WeakMap<Page>`인
 * 것과 반대다. 저쪽은 `page.request`로 받아 그 브라우저와 수명이 묶여 있지만, 여기 값은
 * 브라우저와 무관하고, 페이지에 묶으면 패스마다 83콜을 다시 낸다. 대신 TTL을 둔다
 * (객실 구성이 바뀌면 하루 안에 따라간다). 네트워크 실패는 캐시하지 않는다 — 빈 틀
 * 응답(모르는 코드)만 null로 캐시한다.
 *
 * 정원은 비용이 작아 `withPrices` 게이트를 타지 않는다(`docs/notes/occupancy.md`).
 * 전부 삼킨다: 실패하면 그 행만 인원이 비고 재고 행은 그대로다.
 */

const TTL_MS = 6 * 60 * 60 * 1000;
const CONCURRENCY = 10;
/** 팝업 한 콜의 상한. 실제 값은 남은 예산에서 유도한다. */
const CALL_TIMEOUT_MS = 5_000;

type Occupancy = NonNullable<InventoryRow["occupancy"]>;
const cache = new Map<string, { value: Occupancy | null; at: number }>();

export async function attachOccupancy(
  ctx: CrawlerContext,
  branch: KensingtonBranch,
  rows: KensingtonRow[],
): Promise<void> {
  const now = Date.now();
  const missing = [
    ...new Set(
      rows
        .map((r) => r.code)
        .filter((code) => {
          const hit = cache.get(key(branch, code));
          return !hit || now - hit.at > TTL_MS;
        }),
    ),
  ];

  let failed = 0;
  if (missing.length > 0) {
    const results = await mapPool(missing, CONCURRENCY, (code) => fetchOne(ctx, branch, code));
    for (const [i, r] of results.entries()) {
      if (r.ok && r.value !== undefined) cache.set(key(branch, missing[i]), { value: r.value, at: Date.now() });
      else failed++;
    }
  }

  let attached = 0;
  for (const { code, row } of rows) {
    const value = cache.get(key(branch, code))?.value;
    if (value) {
      row.occupancy = value;
      attached++;
    }
  }
  if (missing.length > 0 || attached < rows.length) {
    ctx.log("[kensington] occupancy", {
      branch: branch.value,
      rows: rows.length,
      fetched: missing.length,
      failed,
      attached,
    });
  }
}

/** 받았으면 값(모르는 코드는 null), 못 받았으면 undefined — undefined만 캐시하지 않는다. */
async function fetchOne(
  ctx: CrawlerContext,
  branch: KensingtonBranch,
  code: string,
): Promise<Occupancy | null | undefined> {
  const remaining = ctx.deadlineAt - Date.now() - KENSINGTON.timeouts.returnReserve;
  if (remaining < 500) return undefined;
  try {
    const res = await fetch(KENSINGTON.roomInfoUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": KENSINGTON.anonymousUserAgent,
      },
      body: new URLSearchParams({ bran_cd: branch.branCd, room_type_cd: code }).toString(),
      signal: AbortSignal.timeout(Math.min(CALL_TIMEOUT_MS, remaining)),
    });
    if (!res.ok) return undefined;
    return parseOccupancy(await res.text());
  } catch {
    return undefined;
  }
}

function key(branch: KensingtonBranch, code: string): string {
  return `${branch.branCd}:${code}`;
}
