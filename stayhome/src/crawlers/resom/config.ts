/**
 * RESOM (리솜리조트 · 호반호텔앤리조트) crawl configuration.
 *
 * The booking site `book.resom.co.kr` is a Vue SPA over a same-origin JSON API,
 * so — as with Lotte and SONO — the browser is only used to log in and search
 * is a plain request. What is different here is authentication and response
 * shape, and both are load-bearing.
 *
 * Discovery notes (2026-08-09, against the real 제휴 account):
 * - login:    POST {apiBase}/auth/login   (driven via the form)
 *             → { accessToken, member: { intnetId, memNo, memInd, … } }
 * - session:  GET  {apiBase}/auth/info    → { member: { memNo, memInd } }
 * - condos:   GET  {apiBase}/roomReservation/allCondos
 *             → [{ condoCd, condoNm, bizNm, roomTypeList: [{ rmTypeCd, rmTypeNm, dongNm }] }]
 * - rooms:    GET  {apiBase}/roomReservation/calendarRooms
 *             ?memNo&memInd&condoCd&ciYmd&coYmd&nights&rmCnt&rmTypeCd(repeated)
 *
 * Four things are non-obvious:
 *
 *   1. **The API is bearer-token, not cookie.** Carrying the login cookies and
 *      omitting the header gets a 401. The SPA sends
 *      `Authorization: Bearer …`, `login-id: <intnetId>` and
 *      `user-device: HOMEPAGE`, and persists the token in localStorage under
 *      `SHA256("hoban-user-front-local")` encrypted with a constant app
 *      passphrase. We do not read that blob — `login.ts` captures the token
 *      from the login response and stashes it in a cookie of our own, because
 *      `storageState` persists cookies and they can be read back without
 *      navigating (see `auth` below).
 *
 *   2. **`calendarRooms` is keyed by check-in date**, not by stay:
 *      `{ "20260901": [ …room types… ], "20260902": [ … ] }`. `ciYmd`/`coYmd`
 *      bound the range, and the range is honoured literally — a 20260809 →
 *      20260930 request returned all 53 days with no gaps across the month
 *      boundary. So one call covers the whole hot window per property.
 *
 *   3. **`nights` changes nothing.** 1, 2 and 7 nights returned identical
 *      status and counts on all 180 shared entries. The response describes one
 *      night at a time, so `parse.ts` derives a stay by AND-ing the nights —
 *      the same conclusion SONO's calendar forced, reached from measurement
 *      rather than by analogy.
 *
 *   4. **`remdRmCnt` goes negative** (observed -33), and `statusBooking`
 *      tracks it exactly: `statusBooking === 1` ⟺ `remdRmCnt > 0` on all 180
 *      entries measured. Availability reads `statusBooking`; the raw count is
 *      only used for the closing-soon threshold, and only when positive.
 */
export const RESOM = {
  /** Booking host. `Resort.baseUrl` points at the marketing site, not this. */
  baseUrl: "https://book.resom.co.kr",
  loginUrl: "https://book.resom.co.kr/login?resort=resom",
  apiBase: "https://book.resom.co.kr/api/user/reservation",
  /** Human-facing 회원 객실 예약 page — used for detailUrl and as API referer. */
  bookingUrl: "https://book.resom.co.kr/roomReservation?resort=resom",

  login: {
    /**
     * There is no `<form>` and the inputs carry no `name` or `id` — only
     * placeholders. The submit is an anchor, not a button: the page's only
     * `button` role is "GO", and the header renders another `로그인` anchor
     * with the same accessible name, so the class is what separates them.
     */
    idInputSelector: "input[placeholder='아이디를 입력해주세요']",
    pwInputSelector: "input[type='password']",
    submitSelector: "a.login_btn",
  },

  auth: {
    /**
     * Our own cookie, not the site's. The bearer token only ever appears in
     * the login response, and a restored session never sees one — so it has to
     * be carried across passes somehow. A cookie rides in `storageState`
     * exactly like the site's own, and unlike localStorage it can be read
     * without first navigating to the origin, which keeps `validateSession`
     * a single request the way Lotte's and SONO's are.
     */
    cookieName: "welfarestay_auth",
    cookieDomain: "book.resom.co.kr",
    userDevice: "HOMEPAGE",
  },

  /**
   * How many days one `calendarRooms` call asks for, counted from the
   * requested check-in.
   *
   * This lives here rather than in `lib/inngest/windows.ts` on purpose: how
   * wide a response may be is only observable from the site, and a copy in the
   * scheduler would fail silently as "those dates are just empty". 45 covers
   * the 30-day hot window with room for the tail of a long stay, and one call
   * of that width for the largest property is well inside `timeouts.api`.
   */
  calendarSpanDays: 45,

  /** Rooms per request — the reservation widget's own default. */
  roomCount: 1,

  /**
   * The three properties. `value` is stored as `ResortInventory.branchName`
   * and is the single source of truth for it; the parser must never build a
   * name from the response. `condoCd` is the API's property code and stays out
   * of `resort-catalog.ts`.
   *
   * `region` is the two-character 광역 used by every other resort, not the
   * site's `bizNm` (덕산/제천/안면도) — otherwise the region chips would split
   * along a different axis than Lotte's and SONO's.
   */
  branches: [
    { value: "포레스트 리솜", label: "제천", region: "충북", condoCd: "1075" },
    { value: "스플라스 리솜", label: "덕산", region: "충남", condoCd: "1027" },
    { value: "아일랜드 리솜", label: "안면도", region: "충남", condoCd: "1001" },
  ] as const,

  /**
   * Rooms remaining at or below this count → closingSoon.
   *
   * A threshold, not a site signal: unlike SONO — which publishes a 마감임박
   * code — this API only reports a count, so this is the same inference Lotte
   * makes, with the same number.
   */
  closingSoonThreshold: 2,

  /** Cached storage state lifetime (login skip window). */
  sessionTtlHours: 6,

  /** Per-step deadlines (ms). Keep the total well under STEP_BUDGET_MS. */
  timeouts: {
    navigation: 20_000,
    login: 25_000,
    /** One calendarRooms call: 53 days × 25 room types measured well under this. */
    api: 30_000,
  },
} as const;

export type ResomConfig = typeof RESOM;
export type ResomBranch = (typeof RESOM.branches)[number];
