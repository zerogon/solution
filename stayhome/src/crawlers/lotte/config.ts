/**
 * Lotte Resort crawl configuration — lottehotel.com integrated site.
 *
 * lotteresort.com was merged into LOTTE HOTELS & RESORTS (confirmed
 * 2026-07-26): every old path 301s to www.lottehotel.com, and resort booking
 * lives on the resort.lottehotel.com subdomain. The room list there is served
 * by a plain JSON API that works without a session, so the crawler only uses
 * the browser for login (member-rate session cookies) and calls the API via
 * `page.request` for search — no calendar/DOM interaction at all.
 *
 * Discovery notes:
 * - room list:  GET {roomListApiUrl}?rsvType=BAR&bizCd=..&checkinDt=YYYYMMDD&checkoutDt=YYYYMMDD&roomCnt=1
 * - session:    GET {isLoginUrl} → { code: "0000", data: boolean }
 * - bizCd per property comes from the CMS catalog's `anotherBookingUrl`
 *   (https://resort.lottehotel.com/cms/common/hotel-catalogs/ko_catalogs.json)
 */
export const LOTTE = {
  baseUrl: "https://www.lottehotel.com",
  /** Rewards (integrated L.POINT) login form. */
  loginUrl: "https://www.lottehotel.com/global/ko/login/rewards",
  /** Session probe — returns { data: true } when the cookies are authenticated. */
  isLoginUrl: "https://resort.lottehotel.com/common/login/isLogin",
  /** Room availability JSON API. */
  roomListApiUrl: "https://resort.lottehotel.com/api/main/ko/reservation/roomList",
  /** Human-facing booking page — used for detailUrl and as API referer. */
  bookingUrl: "https://resort.lottehotel.com/main/ko/reservation/accommodation",

  login: {
    /** Cookie-consent banner button (appears once per fresh context). */
    cookieConsentButtonName: "전체 동의",
    /**
     * The login page has two tabs: "리워즈 로그인" and "L.POINT 로그인".
     * 리조트 온라인 회원/법인회원은 L.POINT 탭으로만 로그인 가능 (페이지 하단
     * 안내문 기준, 2026-07 홈페이지 통합 이후).
     */
    tabName: "L.POINT 로그인",
    /** `:visible` — both tabs' inputs can coexist in the DOM. */
    idInputSelector: 'input[name="loginId"]:visible',
    pwInputSelector: 'input[name="loginPw"]:visible',
    /** Form submit. Exact match keeps it apart from "카카오톡 간편 로그인" 등. */
    submitButtonName: "로그인",
  },

  /**
   * Known branches. `value` is stored as ResortInventory.branchName and must
   * match what SearchView sends to /api/inventory. `bizCd` is the property
   * code the reservation API expects.
   *
   * 산정호수 was dropped from the lineup during the site merge (absent from
   * the integrated catalog) — re-add here if it ever returns.
   */
  branches: [
    { value: "롯데리조트 속초", label: "속초", region: "강원", bizCd: "81" },
    { value: "롯데리조트 부여", label: "부여", region: "충남", bizCd: "61" },
    { value: "아트빌라스 제주", label: "제주", region: "제주", bizCd: "71" },
    { value: "롯데호텔앤리조트 김해", label: "김해", region: "경남", bizCd: "91" },
  ] as const,

  /** rooms remaining at or below this count → closingSoon */
  closingSoonThreshold: 2,

  /** Cached storage state lifetime (login skip window). */
  sessionTtlHours: 6,

  /** Per-step deadlines (ms). Keep total well under STEP_BUDGET_MS in run.ts. */
  timeouts: {
    navigation: 20_000,
    login: 25_000,
    /** Single roomList API call */
    api: 15_000,
  },
} as const;

export type LotteConfig = typeof LOTTE;
export type LotteBranch = (typeof LOTTE.branches)[number];
