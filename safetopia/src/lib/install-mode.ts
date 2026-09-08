/**
 * 설치 시트를 띄울지, 어떤 안내를 보일지 정하는 순수 판정.
 *
 * `window`를 직접 읽지 않고 `InstallEnv`를 받는다 — vitest(node 환경)에서 대표 UA
 * 매트릭스를 그대로 돌릴 수 있어야 하기 때문이다. 브라우저에서 읽는 유일한 곳은
 * `readInstallEnv()`이고, 컴포넌트(`components/pwa/PwaInstallPrompt.tsx`)가 그것을
 * 부른다.
 */

export interface InstallEnv {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /**
   * `(any-pointer: coarse)` 판정. **`null`은 "브라우저가 이 쿼리를 모른다"**는 뜻이다 —
   * `matchMedia`가 미지원 쿼리를 받으면 `media`가 "not all"로 돌아오고 `matches`는
   * 항상 false라, 그 값을 그대로 쓰면 폰을 PC로 오판한다.
   */
  anyPointerCoarse: boolean | null;
}

/**
 * PC는 시트 자체를 띄우지 않으므로 데스크톱 전용 모드는 없다(`isDesktop` 참고).
 *
 * `chrome`은 `beforeinstallprompt`를 손에 쥔 상태 — "지금 설치" 원클릭이 가능하다.
 * `chromeManual`은 같은 Chromium인데 그 이벤트가 오지 않은 상태다. 이 경우에도
 * 시트는 뜨고 메뉴 경로를 안내한다. 둘의 구분은 이벤트 유무라 여기서는 못 하고
 * 컴포넌트가 한다 — `detectInstallMode`는 Chromium을 `null`로 돌려준다.
 */
export type InstallMode =
  | "chrome"
  | "chromeManual"
  | "ios"
  | "firefoxAndroid"
  | "inAppAndroid"
  | "inAppIos"
  | null;

const ANY_POINTER_COARSE = "(any-pointer: coarse)";

/** 브라우저에서 판정 입력을 읽는다. 클라이언트에서만 부른다. */
export function readInstallEnv(): InstallEnv {
  const nav = window.navigator;
  let anyPointerCoarse: boolean | null = null;
  if (typeof window.matchMedia === "function") {
    const mq = window.matchMedia(ANY_POINTER_COARSE);
    // 미지원 쿼리는 `media`가 정규화된 원문 대신 "not all"로 돌아온다.
    anyPointerCoarse = mq.media === ANY_POINTER_COARSE ? mq.matches : null;
  }
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    anyPointerCoarse,
  };
}

/**
 * "확실히 PC"일 때만 참. 설치 시트를 억제하는 유일한 조건이다.
 *
 * **fail-open이어야 한다.** 판단이 서지 않으면 억제하지 않는다 — 안 떠야 할 PC에서
 * 한 번 뜨는 것보다, 떠야 할 폰에서 조용히 안 뜨는 쪽이 훨씬 나쁘다(원인을 찾을
 * 단서가 화면에 하나도 남지 않는다).
 *
 * 그래서 세 단계로 좁힌다.
 *  1. UA가 모바일/태블릿이라고 말하면 즉시 아니다. 폰에서는 여기서 끝난다.
 *  2. 멀티터치 포인트가 있으면 아니다 — iPadOS는 Mac UA를 보고하므로 1로는 안 걸린다.
 *  3. 남은 것만 `any-pointer: coarse`로 가른다. 화면 폭이 아니라 입력 장치로 보는
 *     이유는 창을 좁힌 데스크톱과 태블릿을 폭으로는 가를 수 없기 때문이다.
 *     쿼리를 이해 못 하는 브라우저(`anyPointerCoarse === null`)는 판정을 포기하고 띄운다.
 */
export function isDesktop(env: InstallEnv): boolean {
  if (/android|iphone|ipad|ipod|mobile|tablet|silk|kindle/i.test(env.userAgent)) return false;
  if (env.maxTouchPoints > 1) return false;
  if (env.anyPointerCoarse === null) return false; // 미지원 → 판정 불가 → 억제하지 않는다
  return !env.anyPointerCoarse;
}

export function detectInstallMode(env: InstallEnv): InstallMode {
  const { userAgent: ua, platform, maxTouchPoints } = env;

  // 인앱 웹뷰(카카오톡·네이버·라인·밴드·인스타·페북)는 "홈 화면에 추가"가 아예
  // 불가능하다. 사내 공유는 카톡 링크로 퍼질 가능성이 크므로 먼저 걸러낸다.
  // (아래 iOS/Android 분기에도 같이 걸리기 때문에 순서가 중요하다.)
  if (/kakaotalk|naver|instagram|fbav|fban|fb_iab|daumapps|line\/|band/i.test(ua)) {
    return /android/i.test(ua) ? "inAppAndroid" : "inAppIos";
  }

  // iPadOS 13+ Safari는 "데스크톱 사이트 요청"이 기본 ON이라 Mac UA를 보고한다.
  // UA 스니핑만으로는 안 잡히므로 "터치 되는 Mac" 휴리스틱을 함께 쓴다.
  const isIos =
    /iphone|ipad|ipod/i.test(ua) || (platform === "MacIntel" && maxTouchPoints > 1);
  if (isIos) return "ios";

  // Firefox iOS(FxiOS)는 위 iOS 분기에서 이미 처리된다. 데스크톱 Firefox는 애초에
  // 여기까지 오지 않는다 — 호출부가 `isDesktop`으로 먼저 걸러낸다.
  if (/firefox/i.test(ua) && !/fxios/i.test(ua) && /android/i.test(ua)) {
    return "firefoxAndroid";
  }

  // Chromium 계열. 컴포넌트가 beforeinstallprompt 유무로 chrome/chromeManual을 가른다.
  return null;
}
