/**
 * OAKVALLEY — 오크밸리 (원주, HDC그룹) 회원 콘도 예약.
 *
 * Structurally unlike the other three crawlers, and every difference below was
 * measured on the live site (2026-08-11) with `scripts/debug-oakvalley.ts`.
 *
 * **Two hosts.** Login is a Vite/React SPA on `oakvalley.co.kr` that POSTs
 * `api.oakvalley.co.kr/api/v1/users/sign-in`. Availability lives on
 * `reservation.oakvalley.co.kr` — a 2012-era JSP app (Tomcat `JSESSIONID`,
 * jQuery 1.7.2) whose AJAX hits `*.pns` servlets. Nothing has to bridge them by
 * hand: **the SPA itself POSTs `frontMember.pns?login-oak` during sign-in**, and
 * `common.session.pns?sessionCheck` answers `session_yn:"Y"` immediately after,
 * with no navigation. So `login.ts` is an ordinary form login; the JSP page load
 * belongs to *search*, which needs it for the reason below.
 *
 * **`ptSignature`.** Every JSP form carries a server-generated hidden signature
 * that is serialized into each AJAX POST, so a request cannot be built from a
 * URL the way `resom/search.ts` builds `calendarRooms`. Measured: one harvested
 * signature answered four identical POSTs in a row, so it is bound to the
 * session and the form rather than to a render. That is what makes the cheap
 * shape possible — **boot the condo page once per pass, then fire plain
 * `page.request.post` calls** — instead of driving the DOM per month.
 *
 * **ids and names differ, and it matters.** `c_handler.js` addresses fields by
 * id (`$("#V_T_MONTH")`) while `serialize()` submits them by name (`T_MONTH`).
 * Overriding by name left the id untouched, the form kept submitting the month
 * it was rendered with, and the calendar answered August no matter which month
 * was asked for — a wrong answer that arrived as `success:true`. `search.ts`
 * therefore keys its overrides by **id** and maps to name at send time.
 *
 * Endpoints (2026-08-11, verified with the live corporate account):
 *
 *   POST {apiBase}/users/sign-in                    로그인 (폼 조작으로 유발)
 *   GET  {rsvBase}/common.session.pns?sessionCheck  세션 검증 → session.session_yn
 *   POST {rsvBase}/frontoffice/condo/c_100.jsp      회원 콘도 예약 화면 (condo_flag=CONDO)
 *   POST {rsvBase}/condo.calendar.pns?getCalendar   잔여 객실 (월 달력)
 *
 * What the calendar response is:
 *
 * - `entitys[] = { CD_DATE, WEEK_DAY, DAYS, AVA_YN, RM_RMTYPE, RM_REF1 }`.
 *   `CD_DATE` is a **day-of-month**, not a date — the year and month come from
 *   the request, which is why `parse.ts` takes an explicit scope.
 * - **One call = exactly one month**, clipped to today, with **no tail past
 *   month end** (measured: 08 → days 11..31, 09 → 1..30, 10 → 1..31). SONO got
 *   a `nights-1` tail for free; here the last day of every month is unanswerable
 *   without the next month, so `search.ts` fetches two months and merges them
 *   before building any row.
 * - **`V_IN_BAKSU` (박수) is ignored.** 1박 vs 2박 vs 3박 returned byte-identical
 *   statuses across all 84 shared entries. So the response is a calendar and
 *   `parse.ts` ANDs the nights itself. (`getCalendar_baksu_check` is a separate
 *   servlet the site calls *after* a date is clicked; it is not this one.)
 * - **`AVA_YN` is binary.** Observed distribution over both villages: only "Y"
 *   and "N" — no third state, no remaining-room count anywhere in the payload.
 *   See `parse.ts` for why `closingSoon` is therefore always false.
 * - **The 회원권 axis does not exist for availability.** This account holds five
 *   certificates; all five, *and no certificate at all*, returned identical
 *   calendars for both villages. The request count must not be multiplied by it.
 *
 * We collect **회원 콘도 예약 (CONDO) only**. 쿠폰·패키지(GRP1/GRP2)·성수기
 * 추첨(rslot) are different products and would not mean the same thing as the
 * Lotte, SONO and RESOM rows they sit next to (the same call made for RESOM).
 */
export const OAKVALLEY = {
  baseUrl: "https://oakvalley.co.kr",
  /** NOT `/login` — that route does not exist in the SPA's router. */
  loginUrl: "https://oakvalley.co.kr/account/login",
  /** Sign-in only. `/api/v1/village` and `/api/v1/condo` are public marketing
   *  content with no availability — do not mistake them for an inventory API. */
  apiBase: "https://api.oakvalley.co.kr/api/v1",
  signInUrlPattern: /users\/sign-in/,

  rsvBase: "https://reservation.oakvalley.co.kr",
  entranceUrl: "https://reservation.oakvalley.co.kr/frontoffice/p_entrance.jsp",
  condoUrl: "https://reservation.oakvalley.co.kr/frontoffice/condo/c_100.jsp",
  sessionCheckUrl: "https://reservation.oakvalley.co.kr/common.session.pns?sessionCheck",
  calendarUrl: "https://reservation.oakvalley.co.kr/condo.calendar.pns?getCalendar",
  /** `detailUrl` for every row. The condo page is only reachable by POST, so
   *  the entrance is the deepest link that survives being pasted into an
   *  address bar. */
  bookingUrl: "https://reservation.oakvalley.co.kr/frontoffice/p_entrance.jsp",

  /**
   * Login form, observed rendered (not inferred from the bundle).
   *
   * Scoped to the form because the header renders another control with the
   * accessible name 로그인 — the trap that made RESOM's submit selector a class
   * rather than a role query. All three selectors matched exactly once.
   */
  login: {
    idInputSelector: "form.login-form-wrapper input[placeholder='아이디']",
    pwInputSelector: "form.login-form-wrapper input[type='password']",
    submitSelector: "form.login-form-wrapper button[type='submit']",
  },

  /** The dispatcher field on `p_entrance.jsp` that selects 회원 콘도 예약. */
  condoFlag: "CONDO",
  /** The form whose fields (incl. `ptSignature`) every calendar POST reuses. */
  calendarFormSelector: "#data_param_calendar",

  branches: [
    { value: "밸리 빌리지", label: "밸리 빌리지", region: "강원", complexCd: "1101" },
    { value: "힐스 빌리지", label: "힐스 빌리지", region: "강원", complexCd: "2101" },
  ] as const,
  // A third village (SEONGMUNAN/성문안) exists in /api/v1/village with every
  // field null — an unreleased placeholder, excluded until it has content.

  /**
   * `RM_RMTYPE` → display name, taken from the paired `RM_REF1` in real entities
   * (`{"AP":["031"],…}` — exactly one ref per type, in both villages).
   *
   * This is the only trustworthy source for the 평형: `c_handler.js` contradicts
   * itself, mapping 037→CE and 045→DB in `room_type_fx()` while its calendar
   * renderer draws CE as room_45 and DB as room_37. The data agrees with the
   * renderer. An unmapped code is stored bare rather than guessed — `roomType`
   * is part of the upsert unique key, so a wrong-but-stable name is worse than
   * an ugly-but-true code, and `debug-oakvalley.ts diff` reports unmapped codes.
   */
  roomTypes: {
    // 밸리 빌리지
    AP: "31평",
    BU: "46평",
    NA: "48평",
    SE: "52평",
    // 힐스 빌리지
    CA: "25평",
    CC: "35평",
    DB: "37평",
    CE: "45평",
    DD: "48평",
  } as Record<string, string | undefined>,

  /**
   * Months fetched per pass: the requested check-in's month and the next one.
   *
   * Not a copy of the scheduler's 30-day hot horizon — it is this crawler's own
   * fact that a month response has no tail, so the month after is what makes a
   * month-end stay answerable at all. It happens to cover ≥31 days of check-ins
   * from any starting day, which is why the hot windows collapse the way they do
   * (see `search.ts`). Keeping the horizon out of `windows.ts` is deliberate:
   * a second opinion there would show up as "그 날짜만 조용히 빔".
   */
  calendarMonths: 2,

  /**
   * 이 크롤러가 한 윈도우에 쓰는 시간의 **상한**.
   *
   * 실제 예산은 `search.ts`가 `ctx.deadlineAt`에서 유도한다 — 이 상수 하나로
   * 추정하던 시절에는 `run.ts`의 `withDeadline`이 더 일찍 잘라서, 부분 반환으로
   * 지키려던 행 전부가 `DeadlineExceeded`와 함께 버려질 수 있었다(콜드 로그인
   * 패스의 남은 시간은 20초대까지 내려간다). 이제 둘 중 **작은 쪽**을 쓴다.
   */
  passBudgetMs: 30_000,

  /**
   * 공표된 회원 요금표. **무인증**이고 재고와 다른 호스트다.
   *
   * 이 파일 머리말과 `AGENTS.md`가 이 엔드포인트를 오래 "재고가 없다 — 인벤토리 API로
   * 착각하지 말 것"이라고만 적어 뒀다. 사실이었고, **요금은 아무도 묻지 않았다**
   * (2026-08-26 `axes`). 각 빌리지의 `roomPriceTable`에 회원 요금표와 시즌 달력이
   * HTML로 들어 있다.
   */
  villageApiUrl: "https://api.oakvalley.co.kr/api/v1/village",

  /**
   * 요금표의 세 열(기명 · 무기명 · 회원대여가) 중 이 계정이 쓰는 것.
   *
   * **사이트가 말해주지 않는다.** `getRoomMember`가 돌려주는 회원권 5개가 전부
   * `guestType: "콘도회원"`이고 기명/무기명을 가르는 필드가 없다(`cdRef1`/`cdRef5`가
   * 그걸 뜻할 수도 있으나 디코딩할 근거가 없다). 밸리 31평 비수기 주중 기준
   * 기명 77,000 · 무기명 80,000 · 회원대여가 98,000으로 최대 27% 차이라, 추측으로
   * 고를 수 있는 값이 아니다.
   *
   * 그래서 이 값은 **관측이 아니라 운영자의 답**이다(2026-08-26). 회원권 구성이
   * 바뀌면 여기를 같이 바꿔야 하고, 안 바꾸면 증상은 에러가 아니라 4~27% 틀린 금액이다.
   */
  rateFare: "기명",

  /**
   * `RM_RMTYPE` → 요금표의 줄 이름. `roomTypes`(평형 라벨)와 **다른 지도**다.
   *
   * 실측(`axes`, 2026-08-26)으로 만든 것이고, 평형만으로는 만들 수 없다:
   * 밸리의 `NA`/`SE`를 요금표에 잇는 것은 평형이 아니라 **동**이다
   * (`SEC_DIV` "N동"·"S동" ↔ "빌라 N 48평형"·"빌라 S 52평형").
   *
   * **`AP`(31평)와 `BU`(46평)는 일부러 비어 있다.** 요금표에 `31평 (일반)`과
   * `31평 (노블)`이 따로 있고 ~20% 다른데, 재고에는 그 축이 없다 —
   * `RM_RMTYPE` → (`RMTYPE_DESC`|`SEC_DIV`)가 1:1이므로 **사이트가 두 등급을 한 예약
   * 단위로 접고 있다.** 우리 파서의 손실이 아니라 재고 자체의 사실이라, 어느 값을
   * 골라도 절반은 틀린다. 여기 없는 코드는 그냥 요금이 붙지 않는다.
   */
  rateRows: {
    // 힐스 빌리지 — 평형이 그대로 줄 이름이다.
    CA: "25평형 (취사불가)",
    CC: "35평",
    DB: "37평",
    CE: "45평",
    DD: "48평",
    // 밸리 빌리지 — 동으로 잇는다.
    NA: "빌라 N 48평형",
    SE: "빌라 S 52평형",
  } as Record<string, string | undefined>,

  timeouts: {
    navigation: 20_000,
    login: 25_000,
    boot: 20_000,
    api: 15_000,
    /** 공표 요금표 한 번. 부가 정보이므로 재고 호출보다 훨씬 짧게 잡는다. */
    rates: 8_000,
  },
} as const;

export type OakvalleyConfig = typeof OAKVALLEY;
export type OakvalleyBranch = (typeof OAKVALLEY.branches)[number];
