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
  /**
   * 로그인한 사용자 정보. **회원 요금의 열쇠 두 개가 여기서 나온다**
   * (`memberNo`와 `registerCd` → `ownType`). 로그인 상태에서만 의미 있는 응답이고,
   * 회원사명·담당자명·이메일이 평문으로 들어 있어 `member.ts`가 읽는 칸만 선언한다.
   */
  userApiUrl: "https://resort.lottehotel.com/common/login/user",

  /**
   * roomList 요청의 **고정** 파라미터. 예전에는 `search.ts`에 리터럴로 박혀 있었는데,
   * 회원 축이 생기면서 "무엇이 고정이고 무엇이 신원인지"를 한 곳에서 말해야 해졌다.
   *
   * `rsvType`의 대안 어휘는 실측으로 하나뿐이고(번들에서 캔 `PRO`), 인증·익명 모두
   * **0행**으로 거절됐다. 회원 요금을 여는 축은 `rsvType`이 아니라 `ownType`이다.
   */
  rsvType: "BAR",
  procType: "",

  /**
   * 예약유형 코드. 사이트 번들 `layouts.base.js`가 직접 주석으로 적어 둔 값이다 —
   * `ownType: null, // 예약유형 (1: 기명, 2: 지인, 5: 무기명)`.
   *
   * **어느 값을 쓸지는 계정이 정한다**(`member.ts`의 `ownTypeOf`). 여기 박는 것은
   * 어휘이지 선택이 아니다 — 오크밸리 `rateFare`가 운영자의 답을 상수로 박아야 했던
   * 것과 달리, 롯데는 사이트가 계정 필드(`registerCd`)로 답해 준다.
   */
  ownType: { named: "1", acquaintance: "2", unnamed: "5" },

  /** 분양회원(`"R"`)만 회원 요금 트랙을 갖는다. 같은 응답에 `"CYBER"` 엔트리도 온다. */
  membershipTypeOwned: "R",

  login: {
    /** Cookie-consent banner button (appears once per fresh context). */
    cookieConsentButtonName: "전체 동의",
    /**
     * Modal layers that sit in front of the login form. A fresh context in
     * Korea gets the cookie-consent banner; the scheduled crawl runs from a US
     * Vercel region and hit a layer whose dismiss button is not "전체 동의" —
     * the click on the L.POINT tab then timed out for 20s against
     * `.modal-dimm ... intercepts pointer events` rather than failing on the
     * tab itself. Candidates are tried in order and the layer names itself in
     * the log when none of them match, so the next unknown one is one run away
     * from being identified instead of being invisible.
     */
    overlaySelector: ".layer-wrap",
    /**
     * What actually covers the page — and what Playwright names as the
     * intercepting element. `.layer-wrap` is the wrong thing to *detect* on:
     * the page carries several of them and its children are fixed-positioned,
     * so the wrapper's own box can be empty and `isVisible()` false while the
     * dimm in its subtree is swallowing every click. It stays as the scope for
     * finding the dismiss button, chosen by which wrapper holds a live dimm.
     */
    overlayDimmSelector: ".modal-dimm:visible",
    /**
     * The layer is not in the DOM when `domcontentloaded` resolves — a
     * point-in-time check right after `goto` saw nothing and logged nothing,
     * and the layer then appeared *during* the tab click and intercepted it.
     * So wait briefly for it, and retry the click with the dismissal in
     * between rather than spending one long timeout on a blocked click.
     */
    overlayAppearMs: 1_500,
    tabClickAttempts: 3,
    tabClickTimeoutMs: 5_000,
    overlayDismissButtonNames: [
      "전체 동의",
      "모두 동의",
      "동의",
      "확인",
      "닫기",
      "Accept All",
      "Accept",
      "Close",
    ],
    /**
     * The login page has two tabs: "리워즈 로그인" and "L.POINT 로그인".
     * 리조트 온라인 회원/법인회원은 L.POINT 탭으로만 로그인 가능 (페이지 하단
     * 안내문 기준, 2026-07 홈페이지 통합 이후).
     */
    tabName: "L.POINT 로그인",
    /**
     * Proof the switch actually landed. Both tabs' inputs live in the DOM at
     * once, so `:visible` still resolves to the 리워즈 form until the tab
     * updates — filling then puts a resort member ID into the wrong form and
     * the failure is silent: no error, `isLogin` simply stays false until the
     * login timeout. One run in two died this way.
     */
    tabSelectedSelector: '[data-tab-value="LPOINT"][aria-selected="true"]',
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

  /**
   * How many branches to query at once.
   *
   * Four, which is every branch — the whole list goes out in one round trip's
   * worth of wall clock. That is defensible here and nowhere else in this repo:
   * the calls are independent JSON GETs, there are only four of them, and the
   * site showed no rate limiting or queue in front of this endpoint (unlike
   * HANWHA, which sits behind NetFunnel and is deliberately given a smaller
   * pool than its branch count).
   */
  branchPool: 4,

  /** Per-step deadlines (ms). Keep total well under STEP_BUDGET_MS in run.ts. */
  timeouts: {
    navigation: 20_000,
    login: 25_000,
    /**
     * 한 번의 roomList 호출 **상한**. 실제 값은 남은 예산에서 유도한다
     * (`search.ts`의 `callTimeout`) — 이 상수만 쓰면 시계가 둘이 된다.
     *
     * 유도가 필요한 이유는 이 사이트의 지연이 널뛰기 때문이다. 실측(2026-09-01,
     * 같은 창을 세 번): **처음 묻는 (지점, 날짜)는 18초까지 걸리고 다시 물으면
     * 1초 남짓**이다. 즉 콜 수가 아니라 **날짜가 새것이냐**가 비용을 정한다
     * (BAR 4콜 병렬이 18.0초, BAR+회원 8콜 병렬이 0.6초로 나온 실측이 그 증거다).
     * 핫 스윕은 60개 창이 전부 새 날짜라 이 꼬리를 매번 만난다.
     */
    api: 15_000,
    /**
     * 검색이 `ctx.deadlineAt`보다 이만큼 먼저 끝나도록 뺀다.
     *
     * 넘기면 잃는 것은 그 콜이 아니라 **패스 전체의 SUCCESS 판정**이다 —
     * `run.ts`가 검색을 `withDeadline`으로 감싸고, 초과는 부분 반환이 아니라
     * `DeadlineExceeded`로 나타난다. 2026-09-01 핫 스윕이 정확히 그렇게 죽었다
     * (11창 117행을 커밋해 놓고 `deadline exceeded for search after 6598ms`).
     */
    returnReserve: 1_500,
  },
} as const;

export type LotteConfig = typeof LOTTE;
export type LotteBranch = (typeof LOTTE.branches)[number];
