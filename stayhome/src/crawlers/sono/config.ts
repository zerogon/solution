/**
 * SONO Hotels & Resorts crawl configuration.
 *
 * The whole site is a SPA over a JSON API (`/api/hms/user/...`), so — as with
 * Lotte — the browser is only used to log in; search is a plain request.
 * Unlike Lotte, nothing here works logged out: opening the booking widget
 * anonymously pops a "로그인이 필요합니다" dialog.
 *
 * Discovery notes (2026-08-09, against the real 제휴 account):
 * - login:    POST {apiBase}/management/auth/login          (driven via the form)
 * - session:  GET  {apiBase}/management/auth/userinfo       → { body: { userInfo: { memNo } } }
 * - places:   GET  {apiBase}/memberReservation/room/placeList?memNo&userIndCd
 * - rooms:    POST {apiBase}/memberReservation/room/list/pc  (body = RoomListRequest)
 *
 * Three things about the room list are load-bearing and non-obvious:
 *
 *   1. `storeCdList` takes MANY stores per call. All 32 in one request is
 *      7.4s / 2.6MB; one store is 0.35s / 54KB. That is why `search.ts`
 *      batches instead of looping per branch the way Lotte does.
 *   2. The response ignores the requested date for filtering purposes — it
 *      returns ~23 days around it regardless. Rows must be filtered to the
 *      requested `ciYmd`, because `run.ts` upserts everything we return under
 *      the one window it asked for. (The wider window is a real opportunity
 *      for the scheduler later: one call could fill a month.)
 *   3. `rsvRmCnt` goes NEGATIVE on 예약대기 rows (observed -31), so a naive
 *      `> 0` on the raw number is not the same as "bookable".
 */
export const SONO = {
  baseUrl: "https://www.sonohotelsresorts.com",
  loginUrl: "https://www.sonohotelsresorts.com/member/login",
  apiBase: "https://www.sonohotelsresorts.com/api/hms/user",
  /** Human-facing booking page — used for detailUrl and as the API referer. */
  bookingUrl: "https://www.sonohotelsresorts.com/reserve/room?step=sch",

  login: {
    /**
     * There is no <form> element and the inputs carry no `name`, only ids.
     * The header also renders a 로그인 link with the same accessible name as
     * the submit button, so the button has to be scoped to the form area.
     */
    idInputSelector: "#lginId",
    pwInputSelector: "#lginPw",
    submitButtonName: "로그인",
    /** Promo overlay + cookie bar. Exact match: a substring "확인"/"동의"
     *  would also hit the 로그인 안내 dialog and navigate away. */
    dismissButtonNames: ["닫기", "전체 동의"],
  },

  /**
   * Request constants observed in the SPA's own call. They are NOT derivable
   * from `userinfo`, so they are pinned here: `userIndCd` distinguishes the
   * member track and `rsvIndCd` the reservation type. If a different account
   * ever comes back with zero rows across every branch, this pair is the
   * first thing to re-capture (scripts/debug-sono.ts doSearch).
   */
  request: {
    userIndCd: "Y",
    rsvIndCd: "9",
    rmCnt: 1,
    adultCnt: 1,
    childCnt: 0,
  },

  /**
   * Stores to crawl. `value` is stored as `ResortInventory.branchName` and is
   * the single source of truth for the branch string — the room-list response
   * carries its own `storeNm` and the two disagree ("소노벨 A 비발디파크" in
   * the place list vs "소노벨 비발디파크 A" in the room list), so the parser
   * must never read the response's name.
   *
   * `region` is normalized to the same 2-character vocabulary Lotte uses. The
   * API's own `jiyukNm` is 권역-level (강원권/경상권/…) and its `addr` prefix is
   * inconsistent (강원특별자치도 / 강원도 / 경북 / 경상북도), either of which
   * would split the region chips against Lotte's.
   *
   * Excluded: storeCd 91 파나크 영덕 · 92 팔라티움 해운대 · 95 소노벨 경주 감포.
   * They carry `outsYn: "Y"` (위탁 운영) and the member-reservation room list
   * silently drops them from the response — asking for them yields no rows,
   * not an error.
   */
  branches: [
    { value: "소노펫 비발디파크", label: "소노펫 비발디파크", region: "강원", storeCd: "08" },
    { value: "소노벨 A 비발디파크", label: "소노벨 A 비발디파크", region: "강원", storeCd: "09" },
    { value: "소노벨 B·C 비발디파크", label: "소노벨 B·C 비발디파크", region: "강원", storeCd: "02" },
    { value: "소노캄 비발디파크", label: "소노캄 비발디파크", region: "강원", storeCd: "07" },
    // storeFullNm is bare "소노벨 D (호텔)"; the 비발디파크 suffix is added so the
    // branch reads unambiguously next to the 델피노 stores.
    { value: "소노벨 D 비발디파크 (호텔)", label: "소노벨 D 비발디파크 (호텔)", region: "강원", storeCd: "54" },
    { value: "소노벨 EAST 델피노", label: "소노벨 EAST 델피노", region: "강원", storeCd: "70" },
    { value: "소노벨 WEST 델피노", label: "소노벨 WEST 델피노", region: "강원", storeCd: "01" },
    { value: "소노캄 A · B 델피노", label: "소노캄 A · B 델피노", region: "강원", storeCd: "25" },
    { value: "소노캄 C 델피노", label: "소노캄 C 델피노", region: "강원", storeCd: "26" },
    { value: "쏠비치 삼척 리조트", label: "쏠비치 삼척 리조트", region: "강원", storeCd: "61" },
    { value: "쏠비치 삼척 호텔", label: "쏠비치 삼척 호텔", region: "강원", storeCd: "63" },
    { value: "쏠비치 양양 리조트", label: "쏠비치 양양 리조트", region: "강원", storeCd: "10" },
    { value: "쏠비치 양양 호텔", label: "쏠비치 양양 호텔", region: "강원", storeCd: "13" },
    { value: "르네블루 바이 쏠비치", label: "르네블루 바이 쏠비치", region: "강원", storeCd: "94" },
    { value: "소노캄 고양", label: "소노캄 고양", region: "경기", storeCd: "29" },
    { value: "소노벨 양평", label: "소노벨 양평", region: "경기", storeCd: "03" },
    { value: "소노벨 단양 EAST", label: "소노벨 단양 EAST", region: "충북", storeCd: "86" },
    { value: "소노벨 단양 WEST", label: "소노벨 단양 WEST", region: "충북", storeCd: "06" },
    { value: "소노벨 천안 EAST", label: "소노벨 천안 EAST", region: "충남", storeCd: "74" },
    { value: "소노벨 천안 WEST", label: "소노벨 천안 WEST", region: "충남", storeCd: "73" },
    { value: "소노캄 경주", label: "소노캄 경주", region: "경북", storeCd: "05" },
    { value: "소노벨 청송", label: "소노벨 청송", region: "경북", storeCd: "66" },
    { value: "소노문 해운대", label: "소노문 해운대", region: "부산", storeCd: "58" },
    { value: "쏠비치 남해 호텔", label: "쏠비치 남해 호텔", region: "경남", storeCd: "85" },
    { value: "소노캄 거제", label: "소노캄 거제", region: "경남", storeCd: "24" },
    { value: "소노벨 변산 리조트", label: "소노벨 변산 리조트", region: "전북", storeCd: "16" },
    { value: "소노벨 변산 호텔", label: "소노벨 변산 호텔", region: "전북", storeCd: "17" },
    // The API returns "쏠비치 진도 리조트 " with a trailing space; trimmed here
    // because this array — not the response — defines the stored branch name.
    { value: "쏠비치 진도 리조트", label: "쏠비치 진도 리조트", region: "전남", storeCd: "77" },
    { value: "쏠비치 진도 호텔", label: "쏠비치 진도 호텔", region: "전남", storeCd: "78" },
    { value: "소노캄 여수", label: "소노캄 여수", region: "전남", storeCd: "22" },
    { value: "소노캄 제주 리조트", label: "소노캄 제주 리조트", region: "제주", storeCd: "87" },
    { value: "소노벨 제주", label: "소노벨 제주", region: "제주", storeCd: "15" },
  ] as const,

  /**
   * Stores per room-list request. 8 keeps a batch around 0.7MB / 2s, so one
   * failing batch costs a quarter of the pass rather than all of it — the same
   * isolation Lotte gets from its per-branch try/catch, at the granularity
   * this API actually offers.
   */
  batchSize: 8,

  /** Per-step deadlines (ms). Keep the total well under STEP_BUDGET_MS. */
  timeouts: {
    navigation: 20_000,
    login: 25_000,
    /** One room-list batch. A 32-store request measured 7.6s. */
    api: 30_000,
  },
} as const;

export type SonoConfig = typeof SONO;
export type SonoBranch = (typeof SONO.branches)[number];
