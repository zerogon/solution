/**
 * KENSINGTON — 켄싱턴호텔앤리조트 (이랜드파크). 분양회원 경로로 수집한다.
 *
 * 상세(사이트 구조 · 로그인 · 경로 선택 근거 · 실측)는 `docs/crawlers/kensington.md`.
 *
 * - 로그인은 **무기명(법인) 회원** 폼이다(`/member/login_corp/`). 일반 회원 로그인이 아니다.
 * - 재고는 일반 `quick_roomdata`가 아니라 `quick_roomdata_member`다. 일반 경로는 신원이
 *   응답을 한 바이트도 바꾸지 않고(2026-10-18 대조), 회원가는 이 경로에만 있다.
 * - 분양회원번호는 config에 두지 않는다 — 매 패스 `quick_member` 페이지에서 읽는다(`member.ts`).
 */
export const KENSINGTON = {
  baseUrl: "https://www.kensington.co.kr",
  loginUrl: "https://www.kensington.co.kr/member/login_corp/",
  /** `login_corp.js`의 `send_login()`이 보내는 곳. JSON `{com_yn, ret_url}`. */
  loginApiUrl: "/proc/login_corp_result",
  /** 분양회원 빠른예약. 로그인해야 열리고(익명은 302 → `/`), 회원번호가 여기 인라인으로 있다. */
  memberPageUrl: "https://www.kensington.co.kr/reservation/quick_member",
  roomListUrl: "https://www.kensington.co.kr/reservation/quick_roomdata_member/",
  /** 조회 화면의 "예약하기" 링크. 지점·날짜를 URL로 넘길 수 없는 화면이라 진입점만 준다. */
  bookingUrl: "https://www.kensington.co.kr/reservation/quick_member",

  login: {
    formSelector: "#frm_corp",
    idInputSelector: "#corp_id",
    pwInputSelector: "#corp_pw",
  },

  /** 회원번호 선택 버튼의 인라인 핸들러. `(짧은 번호, full 번호)` — full이 `memb_no`로 간다. */
  memberNoPattern: /membno_select\('([^']+)','([^']+)'\)/g,

  /** 리조트 지점의 회원 결제 구분. 호텔은 `P`지만 대상이 아니다. */
  payType: "D",

  // 지점 병렬도 설정이 없는 것은 의도다 — `search.ts`의 머리 주석(순차인 이유).

  timeouts: {
    navigation: 20_000,
    login: 20_000,
    /** 객실 목록 한 콜의 상한. 실제 값은 남은 예산에서 유도한다(`search.ts`의 `callTimeout`). */
    api: 15_000,
    /** 마지막 콜이 끝난 뒤 행을 조립해 반환하기까지 남겨두는 몫. */
    returnReserve: 1_500,
  },

  /**
   * 분양회원 경로로 실제 객실이 나오는 리조트. `membno_select`의 `resortDiv=0` 중 페이지가
   * 걸러내는 글로리콘도 둘을 뺀 것이고, 그랜드 켄싱턴 설악비치(GKT01)는 회원 목록에 없다.
   * 셋 다 어느 경로로도 0개 유형이라 운영자 결정으로 뺐다(2026-10-18).
   *
   * `value`가 곧 `ResortInventory.branchName`이다. `branCd`는 크롤 전용 —
   * `resort-catalog.ts`가 떼어낸다.
   */
  branches: [
    { value: "설악비치", label: "설악비치", region: "강원", branCd: "RKT01" },
    { value: "설악밸리", label: "설악밸리", region: "강원", branCd: "RKT05" },
    { value: "경주", label: "경주", region: "경북", branCd: "RKT02" },
    { value: "지리산남원", label: "지리산남원", region: "전북", branCd: "RHK12" },
    { value: "지리산하동", label: "지리산하동", region: "경남", branCd: "RJR01" },
    { value: "가평", label: "가평", region: "경기", branCd: "RKT08" },
    { value: "충주", label: "충주", region: "충북", branCd: "RKT03" },
    { value: "제주한림", label: "제주한림", region: "제주", branCd: "RKT04" },
    { value: "서귀포", label: "서귀포", region: "제주", branCd: "RKT07" },
    { value: "제주중문", label: "제주중문", region: "제주", branCd: "RHK01" },
  ],
} as const;

export type KensingtonConfig = typeof KENSINGTON;
export type KensingtonBranch = (typeof KENSINGTON.branches)[number];
