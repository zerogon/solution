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
 * - names:    POST {apiBase}/memberReservation/room/detail   (변형 이름, 2026-09-13 — `names.ts`;
 *             body needs `actualMemNo`, without it W22M3S4 "이용회원번호는 필수입니다")
 *
 * Three things about the room list are load-bearing and non-obvious:
 *
 *   1. `storeCdList` takes MANY stores per call. All 32 in one request is
 *      7.4s / 2.6MB; one store is 0.35s / 54KB. That is why `search.ts`
 *      batches instead of looping per branch the way Lotte does.
 *   2. The response is a MONTH CALENDAR, not an answer about one stay
 *      (measured 2026-08-09). The requested `ciYmd` only selects a month: it
 *      returns that whole month, clipped at today and extended by `nights - 1`
 *      days — 0809, 0820 and 0831 all returned 0809-0831, while 0915 returned
 *      0901-0930. And `nights` changes no status or count anywhere: 1, 2 and 7
 *      nights gave byte-identical rows across all 299 shared entries.
 *
 *      So a stay is not something this API answers; `parse.ts` derives it by
 *      AND-ing the nights, and one call covers a month of hot windows rather
 *      than one of them.
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
   * 변형 이름 조회(`names.ts`, `room/detail`). 부가 정보라 예산이 이만큼 남지 않으면
   * 묻지 않고 코드로 진행한다 — 넘기면 잃는 것이 이름이 아니라 패스의 재고 행 전부다.
   */
  variantNames: {
    /** 이보다 적게 남았으면 생략. 8지점 한 콜이 1.0초로 실측됐다. */
    minRemainingMs: 8_000,
    /** 콜 타임아웃을 남은 예산에서 이만큼 떼고 잡는다 — 반환·쓰기 몫. */
    returnReserveMs: 5_000,
  },

  /**
   * 변형별 요금(`prices.ts`, `room/detail/price`). **최신화 경로 전용**이다.
   *
   * 이 엔드포인트는 `storeCd`·`rmTypeCd`를 단수로 받는다 — 배열을 주면 500이고
   * `storeCdList`는 무시된다. 즉 배치가 구조적으로 불가능하고, 비용은 **변형 하나에
   * 콜 하나**다(실측 166ms). 핫 윈도우 전체는 32지점 × 60윈도우 × ~16변형 ≈ 30,000콜
   * ≈ 80분이라 정기 수집 예산 밖이고, 최신화 한 번(지점 1 · 윈도우 1)은 2.6초다.
   * 리솜 요금과 같은 결론에 같은 이유로 도달한다.
   */
  prices: {
    /**
     * 여유가 있어도 사용자를 이보다 오래 세워두지 않는다. `ctx.deadlineAt`과는 다른
     * 판단이다 — 저쪽은 넘기면 재고를 잃는 진짜 한계이고, 이건 응답 시간의 상한이다.
     */
    maxMs: 12_000,
    /** 마지막 콜이 끝나고 행을 돌려주기까지 남겨두는 몫. */
    returnReserveMs: 3_000,
    /**
     * 한 최신화에서 물어볼 변형 수 상한. 실측으로 한 지점 하루가 16변형이라 닿지 않는
     * 값이고, 사이트가 변형을 폭발적으로 늘렸을 때를 위한 안전핀이다(리솜 `priceMaxRooms`).
     */
    maxVariants: 60,
  },

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
    /** One `room/detail` batch (변형 이름, `names.ts`). 8 stores measured 1.0s. An upper bound —
     *  the real timeout is derived from `ctx.deadlineAt`. */
    detail: 10_000,
    /**
     * One `room/detail/price` call (변형 하나, `prices.ts`). Measured 166ms.
     * `api`(30s)가 아니라 이 값인 이유는 리솜과 같다 — 30초짜리 한 콜이 요금 예산
     * 전체를 무효화한다.
     */
    price: 8_000,
  },
} as const;

export type SonoConfig = typeof SONO;
export type SonoBranch = (typeof SONO.branches)[number];
