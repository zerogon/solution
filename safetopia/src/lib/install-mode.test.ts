import { describe, expect, it } from "vitest";
import { detectInstallMode, isDesktop, type InstallEnv } from "@/lib/install-mode";

// 대표 기기. 판정이 바뀌면 여기가 먼저 깨져야 한다 — 실기기 전부를 매번 손에 들 수는 없다.
const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  samsungInternet:
    "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  androidFirefox:
    "Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0",
  kakaoAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36;KAKAOTALK 10.8.0",
  kakaoIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0",
  ipadOsSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
};

function phone(userAgent: string): InstallEnv {
  return { userAgent, platform: "", maxTouchPoints: 5, anyPointerCoarse: true };
}
function desktop(userAgent: string, platform: string): InstallEnv {
  return { userAgent, platform, maxTouchPoints: 0, anyPointerCoarse: false };
}
const ipad: InstallEnv = {
  userAgent: UA.ipadOsSafari,
  platform: "MacIntel",
  maxTouchPoints: 5,
  anyPointerCoarse: true,
};

describe("isDesktop — 억제는 확실할 때만", () => {
  it("폰·태블릿은 미디어 쿼리와 무관하게 아니다", () => {
    for (const ua of [
      UA.iphoneSafari,
      UA.androidChrome,
      UA.samsungInternet,
      UA.androidFirefox,
      UA.kakaoAndroid,
      UA.kakaoIos,
    ]) {
      // 폰이 (any-pointer: coarse)를 false로 보고하더라도 UA에서 끝난다.
      expect(isDesktop({ ...phone(ua), anyPointerCoarse: false })).toBe(false);
    }
  });
  it("iPadOS는 Mac UA를 보고하지만 멀티터치로 걸러진다", () => {
    expect(isDesktop(ipad)).toBe(false);
  });
  it("Windows Chrome·macOS Safari(마우스)만 억제한다", () => {
    expect(isDesktop(desktop(UA.windowsChrome, "Win32"))).toBe(true);
    expect(isDesktop(desktop(UA.macSafari, "MacIntel"))).toBe(true);
  });
  it("any-pointer를 모르는 브라우저는 판정을 포기하고 띄운다(fail-open)", () => {
    expect(isDesktop({ ...desktop(UA.windowsChrome, "Win32"), anyPointerCoarse: null })).toBe(
      false,
    );
  });
});

describe("detectInstallMode", () => {
  it("iPhone Safari → ios", () => {
    expect(detectInstallMode(phone(UA.iphoneSafari))).toBe("ios");
  });
  it("iPadOS(Mac UA + 터치) → ios", () => {
    expect(detectInstallMode(ipad)).toBe("ios");
  });
  it("Android Chromium(Chrome·Samsung Internet) → null, 이벤트 유무는 컴포넌트가 가른다", () => {
    expect(detectInstallMode(phone(UA.androidChrome))).toBeNull();
    expect(detectInstallMode(phone(UA.samsungInternet))).toBeNull();
  });
  it("Android Firefox → firefoxAndroid", () => {
    expect(detectInstallMode(phone(UA.androidFirefox))).toBe("firefoxAndroid");
  });
  it("카카오톡 인앱은 OS별 inApp 모드 — iOS/Android 분기보다 먼저 잡힌다", () => {
    expect(detectInstallMode(phone(UA.kakaoAndroid))).toBe("inAppAndroid");
    expect(detectInstallMode(phone(UA.kakaoIos))).toBe("inAppIos");
  });
});
