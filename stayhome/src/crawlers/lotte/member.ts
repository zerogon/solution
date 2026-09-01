import type { Page } from "playwright-core";
import type { CrawlerContext } from "../types";
import { LOTTE } from "./config";

/**
 * 회원 요금 트랙을 여는 두 값.
 *
 * 이 둘을 `roomList` 요청에 실으면 같은 엔드포인트가 **회원 요금**을 답한다.
 * 실측(2026-09-01, 속초 12객실): 223,000→170,000, 321,000→237,000, 386,000→304,000 —
 * 폭은 -14.2 ~ -26.6%. **둘 다여야 한다** — `memberNo`만 보내면 0행이 오고,
 * `ownType`만 보내면 BAR와 글자 하나 다르지 않은 응답이 온다.
 */
export interface MemberIdentity {
  /** 분양회원 번호(10자리). 계정마다 다르므로 **config에 박지 않는다.** */
  memberNo: string;
  /** 예약유형. 1 기명 · 2 지인 · 5 무기명 (아래 `ownTypeOf`). */
  ownType: string;
}

/**
 * 로그인 사용자 정보에서 우리가 읽는 부분.
 *
 * 이 응답에는 회원사명·담당자명·휴대폰·이메일이 **평문으로** 들어 있다. 여기 선언된
 * 것이 우리가 읽는 전부이고, 나머지는 읽지도 로그에 남기지도 않는다.
 */
interface UserPayload {
  data?: {
    resortList?: MemberEntry[];
    intgList?: MemberEntry[];
  };
}

interface MemberEntry {
  memberNo?: string;
  /** `"R"`(분양회원)만 회원 요금 트랙을 갖는다. `"CYBER"` 엔트리도 같이 온다. */
  membershipType?: string;
  /** `"Y"`인 엔트리가 사이트의 기본 선택이다. */
  primaryYn?: string;
  /** 기명(N) · 무기명(U) · 혼합(NU). `ownType`이 여기서 나온다. */
  registerCd?: string;
  webMemCd?: string;
}

/**
 * 패스당 한 번만 묻는다.
 *
 * `ctx.page`로 키잉한 WeakMap — `oakvalley/rates.ts`·`hanwha`의 `booted`와 같은 모양이다.
 * 지점마다 부르면 윈도우 하나에 네 번이 되고, 이 값은 패스 내내 바뀌지 않는다.
 */
const cache = new WeakMap<Page, Promise<MemberIdentity | null>>();

/**
 * **절대 던지지 않는다.** 이건 부가 정보이고, 실패의 대가는 "요금이 공시가로 나온다"여야지
 * "그 지점 재고가 통째로 없다"가 되면 안 된다. `run.ts`가 검색 전체를 하나의
 * `withDeadline`으로 감싸므로 여기서 새어 나간 예외는 그 패스가 모은 행 전부를 날린다.
 */
export function memberIdentity(ctx: CrawlerContext): Promise<MemberIdentity | null> {
  const hit = cache.get(ctx.page);
  if (hit) return hit;
  const pending = readIdentity(ctx).catch((e) => {
    ctx.log("[lotte] member identity unavailable, falling back to public rates", {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  });
  cache.set(ctx.page, pending);
  return pending;
}

async function readIdentity(ctx: CrawlerContext): Promise<MemberIdentity | null> {
  const res = await ctx.page.request.get(LOTTE.userApiUrl, {
    headers: { Accept: "application/json" },
    timeout: LOTTE.timeouts.api,
  });
  if (!res.ok()) {
    ctx.log("[lotte] login/user HTTP not ok", { status: res.status() });
    return null;
  }
  const payload = (await res.json()) as UserPayload;
  const entries = [
    ...(payload.data?.resortList ?? []),
    ...(payload.data?.intgList ?? []),
  ].filter((e) => e.membershipType === LOTTE.membershipTypeOwned && e.memberNo);

  // 사이트가 기본으로 고르는 엔트리. 실측에서 이 계정은 `primaryYn` Y/N 두 개를 받았고
  // **둘이 완전히 같은 요금표를 답했다**(12행 전부 동일). 그래서 이 선택은 지금 무동작이지만,
  // 임의로 첫 번째를 집는 것과 사이트의 기본값을 따르는 것은 다른 약속이다.
  const entry = entries.find((e) => e.primaryYn === "Y") ?? entries[0];
  if (!entry?.memberNo) {
    ctx.log("[lotte] no owned membership on this account — public rates", {
      entries: entries.length,
    });
    return null;
  }
  const ownType = ownTypeOf(entry);
  if (!ownType) {
    ctx.log("[lotte] unknown registerCd — public rates", { registerCd: entry.registerCd });
    return null;
  }
  // 회원번호는 절대 로그에 남기지 않는다. 남길 값은 "있다/없다"와 예약유형뿐이다.
  ctx.log("[lotte] member identity", { memberNo: "present", ownType });
  return { memberNo: entry.memberNo, ownType };
}

/**
 * 예약유형은 계정 필드에서 **유도된다.** 상수가 아니다.
 *
 * 사이트 번들이 직접 그렇게 적고 있다 — `layouts.base.js`의
 * `ownType: null, // 예약유형 (1: 기명, 2: 지인, 5: 무기명)`이고,
 * `accommodationFull.js`가 `registerCd`(N/U/NU)와 `webMemCd`로 고른다.
 * 실측 계정은 `registerCd:"U"` → `5`(무기명)였고, 사이트가 스스로 쏜 요청도 `ownType=5`였다.
 *
 * **모르는 코드에는 값을 지어내지 않는다.** 사이트의 기본값은 `"1"`(기명)이지만 여기서는
 * `null`을 돌려준다 — 기명과 무기명은 서로 다른 요금이라(오크밸리에서 최대 27% 벌어졌다)
 * 추측이 틀리면 증상이 에러가 아니라 **틀린 금액**이다. 공시가로 물러나는 쪽이 안전하다.
 */
function ownTypeOf(entry: MemberEntry): string | null {
  switch (entry.registerCd) {
    case "N":
      return LOTTE.ownType.named;
    case "U":
      return LOTTE.ownType.unnamed;
    case "NU":
      return entry.webMemCd === "C" ? LOTTE.ownType.unnamed : LOTTE.ownType.named;
    default:
      return null;
  }
}
