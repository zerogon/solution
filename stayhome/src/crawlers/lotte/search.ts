import { selectBranches } from "../_shared/branches";
import { mapPool } from "../_shared/pool";
import type { CrawlerContext, InventoryRow, SearchParams } from "../types";
import { LOTTE, type LotteBranch } from "./config";
import { formatDateCompact } from "./format";
import { memberIdentity, type MemberIdentity } from "./member";
import { parseRoomList, type RoomListPayload } from "./parse";

/**
 * Query availability for every branch via the reservation JSON API.
 *
 * ⚠️ 이 주석은 오래 틀려 있었다. "`page.request`라 로그인 쿠키가 실려서 회원 요금이
 * 온다"고 적혀 있었는데, 2026-09-01 실측으로 **쿠키는 이 응답을 한 글자도 바꾸지
 * 않는다**는 것이 확인됐다(인증/익명 4개 지점 71행 대조: 다른 셀 0개, 객실 집합 차이 0개).
 * 회원 요금은 쿠키가 아니라 **파라미터 둘**(`memberNo`·`ownType`)이 연다 — `member.ts`.
 *
 * 그래서 지점마다 콜이 둘이다. 재고는 BAR가, 요금은 회원 트랙이 답한다 —
 * 아래 `searchOneBranch`에 그 둘을 나눈 이유가 있다.
 */
export async function performSearch(
  ctx: CrawlerContext,
  params: SearchParams,
): Promise<InventoryRow[]> {
  const { log } = ctx;
  const checkinDt = formatDateCompact(params.checkin);
  const checkoutDt = formatDateCompact(params.checkout);
  // 요금이 총액이 되려면 박수가 필요하다. 롯데는 행에 `stay`를 붙이지 않으므로
  // (요청한 윈도우 = 그 행의 숙박) 이 값이 그대로 그 행의 밤 수다.
  const nights = Math.round(
    (params.checkout.getTime() - params.checkin.getTime()) / 86_400_000,
  );

  const branches = selectBranches(LOTTE.branches, params);
  if (branches.length === 0) {
    // 나머지 넷은 이미 갖고 있던 가드다. `mapPool([], …)`이 `[]`를 주고 아래 전멸
    // 판정에도 `branches.length > 0`가 붙어 있어 터지지는 않지만, **이유를 말하지
    // 않는 0행 윈도우는 "그날 전 객실 매진"과 글자 하나 다르지 않다.**
    log("[lotte] no branch to crawl", {
      branch: params.branch,
      excluded: params.excludeBranches?.length ?? 0,
    });
    return [];
  }

  // The four branches are independent JSON GETs to one host with no shared
  // state, so they go out together instead of end to end. This is the whole
  // reason LOTTE now finishes its 60 hot windows in about two passes rather
  // than five, and a pass is a browser launch on the warm instance all five
  // resorts share — see `_shared/pool.ts`.
  //
  // 예산은 콜 타임아웃으로만 개입한다(`callTimeout`). 윈도우 하나가 지점 넷을 한꺼번에
  // 묻고 끝나므로 "다음 지점 앞에서 멈춰 선다"는 게이트를 놓을 자리가 없고, 대신
  // **낙오자 하나가 패스를 죽이지 못하게** 각 콜이 남은 예산 안에서 끝난다.
  // 패스당 한 번. `memberIdentity`는 WeakMap 캐시라 지점 넷이 나눠 쓴다.
  const identity = await memberIdentity(ctx);

  const settled = await mapPool(branches, LOTTE.branchPool, (branch) =>
    searchOneBranch(ctx, branch, checkinDt, checkoutDt, nights, identity),
  );

  const out: InventoryRow[] = [];
  const failures: string[] = [];
  settled.forEach((r, i) => {
    const branch = branches[i];
    if (r.ok) {
      log("[lotte] branch done", { branch: branch.label, rows: r.value.length });
      out.push(...r.value);
      return;
    }
    failures.push(branch.label);
    // One branch failing (API hiccup, temporary closure) shouldn't kill the
    // whole crawl — log and continue.
    //
    // ⚠️ Swallowing here is load-bearing beyond this function: `removeVanishedRows`
    // treats a (branch, checkin, checkout) group with zero rows as "not answered"
    // and leaves it alone. A failed branch producing no rows is exactly that,
    // and turning these into a throw — or into empty placeholder rows — would
    // publish a crawl failure as "every room sold out".
    log("[lotte] branch failed, continuing", {
      branch: branch.label,
      error: r.error instanceof Error ? r.error.message : String(r.error),
    });
  });

  // 삼키는 것은 **한 지점**까지다. 전부 실패하면 `run.ts`가 0행 SUCCESS로 기록하고,
  // 그건 "이 리조트는 그날 전 객실 매진"과 글자 하나 다르지 않다. 조회 화면은
  // 그 둘을 구별할 방법이 없고, 이제 백스톱도 재고를 근거로 판정하므로 이 거짓
  // 성공은 "고칠 필요 없음"으로까지 읽힌다.
  if (branches.length > 0 && failures.length === branches.length) {
    throw new Error(`SEARCH_FAILED: 모든 지점 조회 실패 (${failures.join(", ")})`);
  }
  return out;
}

async function searchOneBranch(
  ctx: CrawlerContext,
  branch: LotteBranch,
  checkinDt: string,
  checkoutDt: string,
  nights: number,
  identity: MemberIdentity | null,
): Promise<InventoryRow[]> {
  const { log } = ctx;

  log("[lotte] roomList API call", {
    branch: branch.label,
    checkinDt,
    checkoutDt,
    member: identity ? "yes" : "no",
  });

  // 두 콜은 **동시에** 나간다. 지점 넷이 이미 `branchPool`로 병렬이라 이 곱이 벽시계에
  // 얹히지 않는다 — 요금을 붙이면서 패스 수가 늘지 않는 이유가 이것이다.
  //
  // BAR는 던지고 회원 트랙은 삼킨다. **재고는 이 도구의 본질이고 요금은 부가 정보라서**,
  // 회원 콜 하나가 실패했을 때의 옳은 결과는 "그 지점이 통째로 실패"가 아니라
  // "그 지점은 공시가로 나온다"다. `parseRoomList`가 그 강등을 라벨에도 반영한다.
  const [bar, member] = await Promise.all([
    fetchRoomList(ctx, branch, { checkinDt, checkoutDt }),
    identity
      ? fetchRoomList(ctx, branch, { checkinDt, checkoutDt }, identity).catch((e) => {
          log("[lotte] member roomList failed, public rates for this branch", {
            branch: branch.label,
            error: e instanceof Error ? e.message : String(e),
          });
          return null;
        })
      : Promise.resolve(null),
  ]);

  if (!bar.roomList?.length) {
    log("[lotte] roomList empty", {
      branch: branch.label,
      rsltCd: bar.rsltCd,
      rsltMsg: bar.rsltMsg,
    });
  }
  return parseRoomList(bar, member, branch, { checkinDt, checkoutDt, nights });
}

/**
 * 한 번의 roomList 호출. `identity`가 있으면 회원 트랙, 없으면 BAR 공시가.
 *
 * 사이트 자신은 이 요청에 21개 칸을 싣는데, 그중 **로그인 여부로 값이 갈리는 것은
 * `memberNo`와 `ownType` 둘뿐**이고 나머지 빈 칸들은 응답을 바꾸지 않는다(실측).
 * 그래서 여기서도 그 둘만 더한다 — 의미 없는 칸을 흉내 내면 무엇이 실제로 답을
 * 움직이는지가 다음 사람에게 보이지 않는다.
 */
async function fetchRoomList(
  ctx: CrawlerContext,
  branch: LotteBranch,
  dates: { checkinDt: string; checkoutDt: string },
  identity?: MemberIdentity,
): Promise<RoomListPayload> {
  const res = await ctx.page.request.get(LOTTE.roomListApiUrl, {
    params: {
      rsvType: LOTTE.rsvType,
      procType: LOTTE.procType,
      bizCd: branch.bizCd,
      checkinDt: dates.checkinDt,
      checkoutDt: dates.checkoutDt,
      roomCnt: "1",
      ...(identity ? { memberNo: identity.memberNo, ownType: identity.ownType } : {}),
    },
    headers: {
      Accept: "application/json",
      Referer: `${LOTTE.bookingUrl}?bizCd=${branch.bizCd}`,
    },
    timeout: callTimeout(ctx),
  });
  if (!res.ok()) {
    throw new Error(`roomList API HTTP ${res.status()} (bizCd=${branch.bizCd})`);
  }
  return (await res.json()) as RoomListPayload;
}

/**
 * 이 콜이 쓸 수 있는 시간. 상수가 아니라 **남은 예산에서 유도한다.**
 *
 * 한화가 지점을 병렬로 묻기 시작하면서 배운 것과 같은 규칙이다 — 순차 루프에서는
 * 예산 게이트가 다음 지점 앞에서 멈춰 세우지만, 한꺼번에 던진 뒤에는 "다음"이 없다.
 * 상한(`timeouts.api`)만 쓰면 15초짜리 낙오자 하나가 남은 예산 6초를 넘겨 부분 반환을
 * `DeadlineExceeded`로 바꾸고, 그러면 **그 패스가 이미 커밋한 행까지 FAILED로 신고된다.**
 *
 * 시간이 모자라 죽은 콜은 그 지점만 0행이 되고 `performSearch`가 삼킨다. 그건 안전한
 * 실패다 — `removeVanishedRows`가 0행 그룹을 건드리지 않으므로 기존 재고가 남는다.
 * (지점 **전부**가 죽으면 그때는 던진다. 0행 SUCCESS는 "전 객실 매진"과 구별되지 않는다.)
 */
function callTimeout(ctx: CrawlerContext): number {
  const remaining = ctx.deadlineAt - Date.now() - LOTTE.timeouts.returnReserve;
  return Math.max(1_000, Math.min(LOTTE.timeouts.api, remaining));
}
