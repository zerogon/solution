/**
 * HANWHA (한화리조트 · 한화호텔앤드리조트) crawl configuration.
 *
 * Two hosts, like Oak Valley, and a date-range JSON API, like Resom:
 *
 *   - `www.hanwharesort.co.kr` — the member site. Login lives here, and so does
 *     the session probe (`sessionCheck.do`). Server-rendered JSP on JEUS.
 *   - `booking.hanwharesort.co.kr` — the reservation system. Every inventory
 *     question is one POST to a generic service gateway (`doExecute.mvc`).
 *
 * Discovery notes (2026-08-13, against the real 제휴 account):
 *
 *   1. **Login is two screens, and the first one alone establishes nothing.**
 *      `login.do` takes ID/password and then redirects to
 *      `login_membership_password.do`, which demands the 회원권 비밀번호.
 *      `sessionCheck.do` answers `resultCode: -1` right up until that second
 *      screen is cleared, and `0` afterwards. A crawler that stopped after the
 *      password would look logged in and collect the anonymous view.
 *
 *      That second secret arrives as `ctx.credentials.memo` — see `login.ts`.
 *
 *   2. **`RSRV_CLDR_CL_CD` is what opens the member view, and nothing else is.**
 *      Same 30 days at 설악 쏘라노, measured:
 *        `02` (일반) → 회원우선 240 / 예약마감 205 / 예약가능 5
 *        `01` (회원) → 예약가능 245 / 대기예약 160 / 예약마감 45
 *      The 240 회원우선 rows flip wholesale. `CONT_NO` and `MEMB_MAST_NO` are
 *      empty on this account and changing them moved nothing, so they are sent
 *      empty rather than guessed at.
 *
 *   3. **`STRT_DATE`..`END_DATE` is honoured literally.** 30, 31, 49 and 60 day
 *      requests returned exactly that many days (설악 60일 = 900행 / 5.9초). One
 *      call per property therefore covers the whole hot window, and rows carry
 *      their own `stay` so `run.ts` skips the windows they answered.
 *
 *   4. **`BRCH_CD` and `LOC_CD` are different numbers and must be sent as a
 *      pair.** Asking 제주 as `1101/1101` instead of `1100/1101` returned zero
 *      rows with no error — indistinguishable from a sold-out property. Both
 *      come straight from the site's own property service
 *      (`INTF_ID: TFO00HBSITSCTM0160`), which `debug-hanwha.ts diff` re-reads.
 *
 * There is no bot protection on the login host, but the booking host loads
 * NetFunnel (STCLab's virtual waiting room) and both hosts set F5 BIG-IP ASM
 * cookies. Neither queued us during the survey. If a pass ever hangs rather
 * than erroring, that is the first thing to suspect — the same gatekeeper
 * family that makes Lotte's cold login unreliable from US regions.
 */
export const HANWHA = {
  baseUrl: "https://www.hanwharesort.co.kr",
  loginUrl: "https://www.hanwharesort.co.kr/irsweb/resort3/member/login.do",
  /** Screen 2. The site navigates here on its own; we never request it directly. */
  membershipUrlPattern: /login_membership_password/,
  /** JSON `{ resultCode }`; 0 means authenticated. One request, no navigation. */
  sessionCheckUrl: "https://www.hanwharesort.co.kr/irsweb/resort3/sessionCheck.do",

  rsvBase: "https://booking.hanwharesort.co.kr",
  /**
   * The page that makes the booking host recognise us.
   *
   * Navigating straight to the availability screen leaves `sCustNo` empty — the
   * two hosts are separate JEUS apps and the reservation one only mints its
   * session when one of its own pages is loaded. 예약내역조회 is the cheapest
   * such page that renders `sCustNo`, and it is read-only.
   */
  entranceUrl: "https://booking.hanwharesort.co.kr/rst/msi/0010/serviceM01.mvc",
  /** Generic service gateway. Which service runs is decided by `serviceInfo`. */
  calendarUrl: "https://booking.hanwharesort.co.kr/rst/cmn/doExecute.mvc",
  /** Human-facing 잔여객실조회 — used for `detailUrl` and as the API referer. */
  bookingUrl: "https://booking.hanwharesort.co.kr/rst/rrs/0080/serviceM00.mvc",

  login: {
    idSelector: "#id",
    pwSelector: "#pwd",
    /** An `<input type=button>` calling `goSubmit()`, not a submit control. */
    submitSelector: "#btnLogin",
    membershipPwSelector: "#membership_password",
    /** Also not a button: an anchor calling `formCheck()`. */
    membershipSubmitSelector: "a.ui_button:has-text('확인')",
  },

  /** 잔여객실 조회 service, as the member screen itself calls it. */
  calendarService: {
    INTF_ID: "TFO00HBSREMPRR0113",
    RECV_SVC_CD: "HBSREMPRR0113",
  },

  /**
   * The constant half of the calendar request, recorded off the wire from the
   * logged-in 잔여객실조회 screen rather than reconstructed from its source.
   *
   * `CUST_NO` is deliberately absent: it is per-account and `search.ts` reads it
   * from the booking page each pass, the same way SONO re-reads its `memNo`.
   */
  request: {
    CORP_CD: "1000",
    MEMB_DIV_CD: "01",
    MEMB_MAST_NO: "",
    CONT_NO: "",
    MEMB_NO: "",
    CUST_IDNT_NO: "",
    RSRV_LOC_CD: "",
    WAIT_RSRV_YN: "N",
    WAIT_RSRV_NO: "",
    OB_YN: "N",
    /** 01 = 회원. The axis that decides which inventory we are shown at all. */
    RSRV_CLDR_CL_CD: "01",
    RSRV_RCEPT_DIV_CD: "2",
    RSRV_ROOM_CNT: "1",
    CORP_CUST_YN: "N",
  },

  /**
   * How many days one calendar call asks for, counted from the requested
   * check-in.
   *
   * Lives here rather than in `lib/inngest/windows.ts` for the reason Resom's
   * copy does: how wide a response may be is only observable from the site, and
   * a second opinion in the scheduler fails silently as "those dates are just
   * empty". 45 covers the 30-day hot window plus the tail of a long stay, and
   * the heaviest property answers that width in about 4.7 seconds.
   */
  calendarSpanDays: 45,

  /**
   * `RSRV_CLDR_RSLT_CD` values that mean the room can be booked.
   *
   * The full code table comes from the site (`getCmnCode.mvc`,
   * `GRP_CD=RSRV_CLDR_RSLT_CD`): 0101·0119 예약가능 / 0111 회원우선 /
   * 0113 회원일반 / 0112·0117 예약마감 / 0108 대기예약 / 0109 예약종료 /
   * 0110 공사중 / 0102–0107·0118 추첨.
   *
   * Only the two 예약가능 codes count. 추첨 (a lottery you enter) and 대기예약
   * (a waitlist on a room you cannot have) are different products — treating
   * them as availability is the same mistake as folding Resom's 추첨 or Oak
   * Valley's package inventory into this table, and it would send someone to a
   * resort that has no room for them.
   */
  availableStatusCodes: ["0101", "0119"] as readonly string[],

  /**
   * Rooms remaining at or below this count → closingSoon.
   *
   * A threshold, not a site signal — the fourth different provenance for this
   * field across five crawlers (Lotte: count threshold, SONO: the site's own
   * `E` code, Resom: count threshold, Oak Valley: neither, so always false).
   * Here `RSRV_POSBL_CNT` is a real remaining count on bookable rows; it also
   * goes negative on unbookable ones, which is why availability is decided by
   * the status code and this number is only consulted afterwards.
   */
  closingSoonThreshold: 2,

  /**
   * The crawler's own soft budget, deliberately under run.ts's 50s pass budget:
   * browser launch and login come out of the same clock, and a search that
   * overruns is killed by `withDeadline` with its rows discarded. Breaking out
   * early returns what we have instead.
   */
  passBudgetMs: 30_000,

  timeouts: {
    navigation: 25_000,
    login: 30_000,
    /** One 45-day call at the largest property measured ~4.7s. */
    api: 25_000,
  },

  /**
   * The sixteen properties, as the site's own property service lists them.
   *
   * `value` is stored as `ResortInventory.branchName` and is the single source
   * of truth for it — `resort-catalog.ts` reads this same array, so the search
   * filters and the collected rows cannot drift apart. `brchCd`/`locCd` are
   * crawl-only and must never reach the catalog.
   *
   * `region` is the two-character 광역 every other resort uses, normalised from
   * the addresses the service returns (`강원 속초시…`, `전라남도 여수시…`);
   * 더 플라자 reports no address and is Seoul by inspection. Using the site's
   * own wording would split the region chips along a different axis than Lotte,
   * SONO, Resom and Oak Valley — 서울 is new to `REGION_ORDER` because of it.
   */
  branches: [
    { value: "설악 쏘라노", label: "설악 쏘라노", region: "강원", brchCd: "0100", locCd: "0101" },
    { value: "설악 별관", label: "설악 별관", region: "강원", brchCd: "0100", locCd: "0102" },
    { value: "용인", label: "용인", region: "경기", brchCd: "0400", locCd: "0401" },
    { value: "산정호수", label: "산정호수", region: "경기", brchCd: "0700", locCd: "0701" },
    { value: "해운대", label: "해운대", region: "부산", brchCd: "0800", locCd: "0801" },
    { value: "대천", label: "대천", region: "충남", brchCd: "0900", locCd: "0901" },
    { value: "경주 에톤", label: "경주 에톤", region: "경북", brchCd: "1000", locCd: "1001" },
    { value: "경주 담톤", label: "경주 담톤", region: "경북", brchCd: "1000", locCd: "1002" },
    { value: "제주", label: "제주", region: "제주", brchCd: "1100", locCd: "1101" },
    { value: "평창", label: "평창", region: "강원", brchCd: "1600", locCd: "1601" },
    { value: "거제 벨버디어", label: "거제 벨버디어", region: "경남", brchCd: "2100", locCd: "2101" },
    { value: "거제 르 씨엘", label: "거제 르 씨엘", region: "경남", brchCd: "2100", locCd: "2102" },
    { value: "여수 벨메르", label: "여수 벨메르", region: "전남", brchCd: "2200", locCd: "2201" },
    { value: "브리드호텔 양양", label: "브리드호텔 양양", region: "강원", brchCd: "2400", locCd: "2401" },
    { value: "마티에 오시리아", label: "마티에 오시리아", region: "부산", brchCd: "2600", locCd: "2601" },
    { value: "더플라자 호텔", label: "더플라자 호텔", region: "서울", brchCd: "3900", locCd: "3901" },
  ] as const,
} as const;

export type HanwhaConfig = typeof HANWHA;
export type HanwhaBranch = (typeof HANWHA.branches)[number];
