import type { BrowserContext, Page } from "playwright-core";
import type { PriceKind } from "@/lib/price";

export type CrawlerLogger = (msg: string, meta?: Record<string, unknown>) => void;

export interface CrawlerContext {
  resortId: string;
  slug: string;
  context: BrowserContext;
  page: Page;
  credentials: {
    id: string;
    pw: string;
    /**
     * `ResortAccount.memo`, verbatim — a second secret for sites whose login
     * asks for more than a password.
     *
     * Only HANWHA reads it: that site answers a correct ID/password with a
     * second screen demanding the 회원권 비밀번호, and until that screen is
     * cleared no session exists at all.
     *
     * **This is not the same grade of secret as `id`/`pw`.** Those are
     * AES-encrypted columns; `memo` is a plaintext column that `/admin/accounts`
     * renders unmasked in the account table. Putting a credential there is the
     * operator's call, not something this field legitimises — a crawler reading
     * it should say in its own config why it is acceptable there.
     */
    memo?: string;
  };
  log: CrawlerLogger;

  /**
   * `run.ts`의 패스 예산이 끝나는 **절대 시각**(epoch ms).
   *
   * 크롤러가 선택적인 추가 작업(요금 조회 등)을 할지 말지 결정할 때 쓴다. 상수로는
   * 대신할 수 없다 — 브라우저 기동과 로그인이 같은 예산에서 이미 얼마를 썼는지는
   * 크롤러가 알 수 없고, 최신화는 세션 TTL(6시간)이 크론 주기보다 짧아 **사실상 항상
   * 콜드 로그인**이다.
   *
   * 넘겼을 때의 대가가 비대칭이라 이 값이 필요하다. `run.ts`가
   * `searchAvailability` 전체를 하나의 `withDeadline`으로 감싸고 그것이 reject하므로,
   * 초과하면 잃는 것은 그 추가 작업이 아니라 **이미 모아둔 재고 행 전부와 SUCCESS
   * 판정**이다. 가용성을 가용성으로 지키는 `passBudgetMs`(hanwha·oakvalley)와 달리
   * 여기서는 가용성을 부가 정보로 걸게 되므로 추정이 허용되지 않는다.
   *
   * 이 시각 **앞에서 스스로 멈추고 가진 것을 반환**할 것. 던지면 안 된다.
   */
  deadlineAt: number;
}

export interface SearchParams {
  /** UTC-midnight check-in date (produced by `parseDate`); read with UTC getters */
  checkin: Date;
  /** UTC-midnight check-out date, same convention as `checkin` */
  checkout: Date;
  /** optional branch filter — matches `ResortInventory.branchName` (applied per-resort) */
  branch?: string;
  /**
   * 이 윈도우에 요금까지 붙여도 되는가.
   *
   * 계약은 **"사람이 지점 하나를 지목해 눌렀고, 결과를 기다리고 있다"**이다. 지금
   * 값의 출처가 요청 본문의 `branch` 유무라는 것은 구현 세부다 — 조회 화면의 최신화가
   * 구조적으로 항상 단일 지점이고(`refreshTarget`), 관리 화면 버튼은 본문 없이,
   * 스케줄러는 날짜만 보내기 때문에 그 하나가 세 경로를 정확히 가른다.
   *
   * 요금은 리조트마다 비용이 다르다(리솜은 행 하나에 콜 하나). 그래서 이 플래그는
   * "요금을 붙여라"가 아니라 **"붙여도 되는 상황이다"**이고, 실제로 감당 가능한지는
   * 각 크롤러가 자기 비용을 아는 자리에서 다시 판정한다.
   */
  withPrices?: boolean;
}

export interface InventoryRow {
  branchName: string;
  roomType: string;
  region: string;
  available: boolean;
  closingSoon: boolean;
  detailUrl?: string;
  /**
   * The stay this row describes, when it is not the one that was requested.
   *
   * Some sites answer a single date with a span around it — SONO's room list
   * returns ~23 days regardless of `ciYmd`, because the SPA uses it to paint
   * its date picker. A crawler that can attribute those extra dates correctly
   * reports them here and `run.ts` files each row under its own stay instead
   * of under the requested window; the scheduler then skips every later window
   * the rows already covered (see the window loop in `run.ts`).
   *
   * Omit it when the rows only describe the requested window — the Lotte
   * crawler does, and gets the original behaviour unchanged.
   *
   * Both dates or neither: a lone `checkin` would silently inherit the
   * requested checkout and quietly claim a stay length nobody measured.
   */
  stay?: { checkin: Date; checkout: Date };

  /**
   * 이 행이 서술하는 숙박 **전체**의 요금과, 그 요금이 무엇인지.
   *
   * `stay`와 같은 규약으로 한 덩어리다 — **둘 다이거나 둘 다 아니다.** 금액과 종류를
   * 따로 두면 라벨 없는 숫자를 발행할 수 있게 되고, 회원가와 공시가는 숫자만으로
   * 구별되지 않는다.
   *
   * 붙이지 않는 것이 기본값이다. 사이트가 요금을 재고 응답 안에 실어주지 않는 한
   * (다섯 곳 중 롯데뿐), 요금은 행마다 별도 호출을 뜻하고 그건 정기 수집 예산에
   * 들어가지 않는다. 판정할 수 없거나 물어볼 시간이 없으면 **그냥 붙이지 않는다** —
   * 없는 요금은 화면에서 빈칸이지만, 틀린 요금은 담당자가 직원에게 전달한다.
   */
  price?: { amount: number; kind: PriceKind };

  /**
   * 이 객실의 기준인원과 최대인원(명).
   *
   * `price`와 같은 규약으로 한 덩어리다 — **둘 다이거나 둘 다 아니다.** 기준만 있으면
   * 화면이 "4인"이라 쓰게 되고, 실제로는 6인까지 되는 방을 담당자가 후보에서 뺀다.
   *
   * `price`와 **다른 점이 하나 있고 그게 중요하다**: 정원은 방의 정적 속성이라
   * 가용성과 무관하다. 롯데 실측(2026-08-28)에서 매진된 행에도 값이 함께 온다.
   * 그래서 요금과 달리 `available` 게이트를 두지 않는다 — 예약할 수 없는 방의
   * 가격은 잡음이지만, 그 방이 몇 명짜리인지는 후보를 추릴 때 여전히 정보다.
   */
  occupancy?: { standard: number; max: number };
}

export interface CrawlerModule {
  slug: string;
  displayName: string;
  defaultRegion: string;

  /** Quick check: is the current storageState still authenticated? */
  validateSession(ctx: CrawlerContext): Promise<boolean>;

  /** Run the login form. Caller is responsible for persisting storageState after. */
  login(ctx: CrawlerContext): Promise<void>;

  /** Run a search pass and return normalized inventory rows. */
  searchAvailability(ctx: CrawlerContext, params: SearchParams): Promise<InventoryRow[]>;
}
