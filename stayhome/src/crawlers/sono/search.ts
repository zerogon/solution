import { toIsoDate } from "@/lib/utils";
import { selectBranches } from "../_shared/branches";
import type { CrawlerContext, InventoryRow, SearchParams } from "../types";
import { SONO, type SonoBranch } from "./config";
import { formatDateCompact } from "./format";
import { fetchMemberNo } from "./login";
import { loadVariantNames } from "./names";
import { parseRoomList, type ParseDiagnostics, type RoomListPayload } from "./parse";
import { attachVariantPrices } from "./prices";
import { SessionLostError } from "../_shared/errors";

/**
 * Query availability via the member-reservation JSON API.
 *
 * The shape differs from the Lotte crawler on purpose: `storeCdList` accepts
 * many stores per request, so this batches rather than looping one call per
 * branch. Measured against the real site — all 32 stores in a single request
 * is 7.4s/2.6MB, one store is 0.35s/54KB — so batching is both faster than
 * per-branch calls and cheap enough that the whole resort fits in one window.
 *
 * `SONO.batchSize` splits that into chunks so a failing batch costs a quarter
 * of the pass instead of all of it. That is the same isolation Lotte gets from
 * its per-branch try/catch, moved to the granularity this API offers.
 *
 * The response is also wide in the other axis: ~23 check-in dates per call,
 * all of them for the `nights` we asked for. Rows come back stamped with their
 * own `stay`, so one request answers three weeks of hot windows at once.
 */
export async function performSearch(
  ctx: CrawlerContext,
  params: SearchParams,
): Promise<InventoryRow[]> {
  const { log } = ctx;
  const ciYmd = formatDateCompact(params.checkin);
  const coYmd = formatDateCompact(params.checkout);
  const nights = Math.round(
    (params.checkout.getTime() - params.checkin.getTime()) / 86_400_000,
  );

  const branches = selectBranches(SONO.branches, params);
  if (branches.length === 0) {
    log("[sono] no branch to crawl", {
      branch: params.branch,
      excluded: params.excludeBranches?.length ?? 0,
    });
    return [];
  }

  // Every room-list request needs the member number, and it is per-account —
  // fetch it once per window rather than pinning it in config.
  const memNo = await fetchMemberNo(ctx);
  if (!memNo) throw new SessionLostError("userinfo returned no member number");

  const out: InventoryRow[] = [];
  for (let i = 0; i < branches.length; i += SONO.batchSize) {
    const batch = branches.slice(i, i + SONO.batchSize);
    try {
      const payload = await fetchRoomList(ctx, memNo, batch, { ciYmd, coYmd, nights });
      // 변형 이름은 list/pc에 없다 — 같은 배치의 room/detail에서 온다(`names.ts`).
      // 패스당 배치마다 한 번이고, 실패해도 던지지 않아 이 배치의 행은 코드 라벨로 남는다.
      const codes = (payload.body ?? []).flatMap((s) =>
        (s.rmTypeList ?? []).map((e) => e.rmTypeCd?.trim() ?? "").filter(Boolean),
      );
      const names = await loadVariantNames(ctx, memNo, batch, { ciYmd, coYmd, nights }, codes);
      let rows = 0;
      const dates = new Set<string>();
      const diag: ParseDiagnostics = { unnamedRmTypeCds: new Set() };
      for (const branch of batch) {
        const parsed = parseRoomList(payload, branch, { nights }, names, diag);
        rows += parsed.length;
        for (const r of parsed) if (r.stay) dates.add(toIsoDate(r.stay.checkin));
        out.push(...parsed);
      }
      log("[sono] batch done", {
        batch: `${i / SONO.batchSize + 1}/${Math.ceil(branches.length / SONO.batchSize)}`,
        stores: batch.length,
        rows,
        // The span is the whole point of this crawler's shape — if it ever
        // collapses to 1 the scheduler quietly goes back to 60 requests.
        checkinDates: dates.size,
      });
      // A variant without a name reaches the screen as its bare rmTypeCd. That is
      // the intended degradation, but it must be visible here first — the crawl
      // log is the only place that can say "these codes went unnamed" by name.
      if (diag.unnamedRmTypeCds.size) {
        log("[sono] unnamed rmTypeCd — room/detail이 이름을 주지 않았다, 화면에는 코드가 그대로 보인다", {
          codes: [...diag.unnamedRmTypeCds].sort(),
        });
      }
    } catch (e) {
      // One batch failing shouldn't kill the crawl — log and keep going, so
      // the window still upserts what the other batches found.
      log("[sono] batch failed, continuing", {
        stores: batch.map((b) => b.label),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 요금은 변형마다 콜 하나라(`prices.ts`) 정기 수집 예산에 들어가지 않는다. 게이트가
  // 둘인 것도 리솜과 같은 이유다 — 라우트가 `branch`의 유무로 "사람이 지목하고 기다리는
  // 상황"을 세우고(`withPrices`), 크롤러가 자기 비용을 아는 자리에서 다시 판정한다.
  // 어긋났을 때의 증상은 항상 "요금이 안 나옴"(안전)이지 "예산 초과"(위험)가 아니다.
  if (params.withPrices === true && branches.length === 1) {
    try {
      await attachVariantPrices(ctx, {
        memNo,
        branch: branches[0],
        rows: out,
        checkin: params.checkin,
        nights,
      });
    } catch (e) {
      // `attachVariantPrices`는 던지지 않지만, 그 약속이 깨져도 재고를 잃지 않게 한 겹 더.
      log("[sono] variant prices failed, continuing", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return out;
}

async function fetchRoomList(
  ctx: CrawlerContext,
  memNo: string,
  batch: readonly SonoBranch[],
  dates: { ciYmd: string; coYmd: string; nights: number },
): Promise<RoomListPayload> {
  const { page } = ctx;

  const res = await page.request.post(
    `${SONO.apiBase}/memberReservation/room/list/pc?lang=ko&deviceType=PC&mobileAppYn=N`,
    {
      timeout: SONO.timeouts.api,
      headers: {
        "content-type": "application/json",
        Accept: "application/json",
        Referer: SONO.bookingUrl,
      },
      data: {
        memNo,
        userIndCd: SONO.request.userIndCd,
        rsvIndCd: SONO.request.rsvIndCd,
        ciYmd: dates.ciYmd,
        coYmd: dates.coYmd,
        nights: dates.nights,
        rmCnt: SONO.request.rmCnt,
        adultCnt: SONO.request.adultCnt,
        childCnt: SONO.request.childCnt,
        storeCdList: batch.map((b) => b.storeCd),
        rmTypeCode: "",
      },
    },
  );
  if (!res.ok()) {
    throw new Error(`room/list HTTP ${res.status()} (stores=${batch.length})`);
  }

  const payload = (await res.json()) as RoomListPayload;
  if (payload.success === false) {
    throw new Error(`room/list returned success=false: ${JSON.stringify(payload.error)}`);
  }
  return payload;
}
