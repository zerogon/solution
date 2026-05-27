/**
 * Lotte Resort crawl configuration.
 *
 * The site is a SPA with menu / modal / calendar widgets — selector-string-only
 * config (the original shape) couldn't represent it. We instead keep labels,
 * URLs, and timeouts here, and call Playwright's accessibility APIs
 * (`getByRole`, `getByText`) from login/search/parse directly. That matches
 * how `npx playwright codegen` captures elements on this site.
 *
 * If any label below stops matching (site copy change), update it here only —
 * login/search/parse reference these constants, not hard-coded strings.
 */
export const LOTTE = {
  /** Public entry. The "로그인" URL alone redirects, so we start on main. */
  mainUrl: "https://www.lotteresort.com/main/ko/index?urlLang=ko",
  baseUrl: "https://www.lotteresort.com",

  /** Menu / login flow */
  login: {
    menuButtonName: "메뉴",
    loginLinkName: "로그인/회원가입",
    idTextboxName: "아이디",
    pwTextboxName: "비밀번호",
    /** Password-change reminder modal that appears after some logins. */
    postLoginDismissButtonName: "다음에 변경",
    /**
     * After login the menu replaces "로그인/회원가입" with the member name +
     * "로그아웃". Detect either of these via text matching.
     */
    loggedInTexts: ["로그아웃", "마이페이지"] as const,
  },

  /** Search flow — entered from the menu */
  search: {
    searchPageLinkName: "객실 검색",
    /** Opens the calendar modal */
    dateRangeButtonName: "투숙기간 선택",
    /** Opens the resort-branch modal */
    branchButtonName: "방문리조트 선택",
    /** Final submit button on the search form */
    submitButtonName: "객실 검색",
  },

  /**
   * Known branches. `value` is what we pass to the booking form (link text in
   * the branch modal); `label` is what the rest of the app shows. Extend this
   * list as we confirm more sites are reachable from this single account.
   */
  branches: [
    { value: "롯데리조트 속초", label: "속초", region: "강원" },
    { value: "롯데리조트 부여", label: "부여", region: "충남" },
    { value: "롯데리조트 제주 아트빌라스", label: "제주", region: "제주" },
    { value: "롯데리조트 김해", label: "김해", region: "경남" },
    { value: "롯데리조트 산정호수", label: "산정호수", region: "경기" },
  ] as const,

  /** Cached storage state lifetime (login skip window). */
  sessionTtlHours: 6,

  /** Per-step deadlines (ms). Keep total well under STEP_BUDGET_MS in run.ts. */
  timeouts: {
    navigation: 15_000,
    login: 20_000,
    modalOpen: 5_000,
    /** Calendar day cell or branch link click → results render */
    searchSubmit: 25_000,
    /** Per-branch search inside the loop */
    perBranch: 30_000,
  },
} as const;

export type LotteConfig = typeof LOTTE;
export type LotteBranch = (typeof LOTTE.branches)[number];
