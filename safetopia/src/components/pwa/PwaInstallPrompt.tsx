"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Bell, Compass, Share, Smartphone, Zap } from "lucide-react";

import { AppMark } from "@/components/app-mark";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// `beforeinstallprompt`는 컴포넌트의 effect가 돌기 전에 발화할 수 있다. 모듈 로드
// 시점에 리스너를 걸어 미리 붙잡아 두지 않으면 그 경우 "지금 설치" 버튼이 아예
// 나타나지 않는다.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
  });
}

const DISMISS_DATE_KEY = "safetopia:install-dismissed-date";

/** PC는 시트 자체를 띄우지 않으므로 데스크톱 전용 모드는 없다(`isTouchDevice` 참고). */
type InstallMode =
  | "chrome"
  | "ios"
  | "firefoxAndroid"
  | "inAppAndroid"
  | "inAppIos"
  | null;

function getLocalDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 오늘 이미 "오늘 하루 보지 않기"를 누른 상태인지.
 *
 * 시트를 여는 **모든 경로**가 이걸 확인해야 한다 — Chrome은 클라이언트
 * 네비게이션마다 `beforeinstallprompt`를 다시 쏘기 때문에, 이 가드가 없으면
 * 세션 중 닫아도 페이지를 옮길 때마다 시트가 다시 열린다.
 */
function isDismissedToday(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_DATE_KEY) === getLocalDateString();
  } catch {
    return false;
  }
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
 *     쿼리를 이해 못 하는 브라우저는 `mq.media`가 "not all"로 돌아온다 — 그때는
 *     `matches`가 항상 false라 PC로 오판하므로, 판정을 포기하고 띄운다.
 */
function isDesktop(): boolean {
  const ua = window.navigator.userAgent;
  if (/android|iphone|ipad|ipod|mobile|tablet|silk|kindle/i.test(ua)) return false;
  if ((window.navigator.maxTouchPoints ?? 0) > 1) return false;

  const query = "(any-pointer: coarse)";
  const mq = window.matchMedia(query);
  if (mq.media !== query) return false; // 미지원 → 판정 불가 → 억제하지 않는다
  return !mq.matches;
}

/**
 * `?install` 이 붙어 있으면 "오늘 하루 보지 않기"를 무시한다.
 *
 * 이 플래그는 localStorage에만 남아서, 한 번 체크하면 그날은 무슨 수를 써도 시트를
 * 다시 볼 수 없다 — 폰에서 사이트 데이터를 지우게 하는 것 말고는 확인할 방법이 없었다.
 */
function isForced(): boolean {
  try {
    return new URLSearchParams(window.location.search).has("install");
  } catch {
    return false;
  }
}

function detectInstallMode(): InstallMode {
  if (typeof window === "undefined") return null;

  const ua = window.navigator.userAgent;
  const platform = window.navigator.platform;
  const maxTouchPoints = window.navigator.maxTouchPoints ?? 0;

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
  // 여기까지 오지 않는다 — 호출부가 터치 기기에서만 부른다.
  if (/firefox/i.test(ua) && !/fxios/i.test(ua) && /android/i.test(ua)) {
    return "firefoxAndroid";
  }

  // Chromium 계열은 beforeinstallprompt 이벤트에 맡긴다.
  return null;
}

export function PwaInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [installMode, setInstallMode] = useState<InstallMode>(null);
  const [dontShowToday, setDontShowToday] = useState(false);
  const checkboxId = useId();

  useEffect(() => {
    const forced = isForced();
    if (!forced && isDismissedToday()) return;

    // 이미 설치된 앱 안에서는 `?install`로도 띄우지 않는다 — 홈 화면에 추가할 것이 없다.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    // PC는 대상이 아니다 — 홈 화면에 추가할 홈 화면이 없다.
    if (!forced && isDesktop()) return;

    const mode = detectInstallMode();

    // 비Chromium 브라우저는 beforeinstallprompt를 쏘지 않으므로 즉시 안내를 띄운다.
    if (mode !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInstallMode(mode);
      setOpen(true);
      return;
    }

    // 모듈 스코프 리스너가 이미 잡아둔 이벤트가 있으면 그것을 쓴다.
    if (deferredPrompt) {
      setEvent(deferredPrompt);
      setInstallMode("chrome");
      setOpen(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      const evt = e as BeforeInstallPromptEvent;
      deferredPrompt = evt;
      if (!forced && isDismissedToday()) return;
      setEvent(evt);
      setInstallMode("chrome");
      setOpen(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function persistIfNeeded() {
    if (!dontShowToday) return;
    try {
      window.localStorage.setItem(DISMISS_DATE_KEY, getLocalDateString());
    } catch {
      // 시크릿 모드/할당량 초과로 저장이 막힐 수 있다. 이번 세션만 닫히고 만다.
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) persistIfNeeded();
    setOpen(next);
  }

  function dismiss() {
    persistIfNeeded();
    setOpen(false);
  }

  async function install() {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    setEvent(null);
    setOpen(false);
  }

  /** 안드로이드 인앱 웹뷰에서 같은 주소를 intent:// 로 Chrome에 넘긴다. */
  function openInChrome() {
    const { host, pathname, search, href } = window.location;
    window.location.href =
      `intent://${host}${pathname}${search}#Intent;scheme=https;` +
      `package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
  }

  /**
   * iOS 인앱 웹뷰에서 Safari로 넘긴다. iOS엔 공식 "Safari로 열기" 스킴이 없어
   * best-effort이며, 지원하지 않는 웹뷰에서는 무시될 수 있다.
   */
  function openInSafari() {
    window.location.href = `x-safari-${window.location.href}`;
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="bottom"
        className="gap-0 pb-4 sm:mx-auto sm:max-w-md sm:rounded-t-2xl"
      >
        <SheetHeader className="flex flex-row items-start gap-3 pr-10">
          <AppMark className="size-12" />
          <div className="flex flex-1 flex-col gap-0.5">
            <SheetTitle>홈 화면에 추가</SheetTitle>
            <SheetDescription>연차 신청과 확인을 더 빠르게.</SheetDescription>
          </div>
        </SheetHeader>

        <ul className="space-y-2 px-4 pb-4">
          <li className="flex items-center gap-2.5 text-sm">
            <Zap className="size-4 text-primary" />앱처럼 바로 실행
          </li>
          <li className="flex items-center gap-2.5 text-sm">
            <Smartphone className="size-4 text-primary" />
            홈 화면 바로가기
          </li>
          <li className="flex items-center gap-2.5 text-sm">
            <Bell className="size-4 text-primary" />
            느린 망에서도 마지막 조회 결과 표시
          </li>
        </ul>

        <InstallHint mode={installMode} />

        <SheetFooter className="gap-3 p-4 pt-0">
          <label
            htmlFor={checkboxId}
            className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none"
          >
            <Checkbox
              id={checkboxId}
              checked={dontShowToday}
              onCheckedChange={(checked) => setDontShowToday(Boolean(checked))}
            />
            오늘 하루 보지 않기
          </label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={dismiss} className="flex-1">
              닫기
            </Button>
            {installMode === "chrome" && (
              <Button onClick={install} className="flex-1">
                지금 설치
              </Button>
            )}
            {installMode === "inAppAndroid" && (
              <Button onClick={openInChrome} className="flex-1">
                Chrome에서 열기
              </Button>
            )}
            {installMode === "inAppIos" && (
              <Button onClick={openInSafari} className="flex-1">
                Safari로 열기
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-[11px] font-semibold text-primary tabular-nums">
      {n}
    </span>
  );
}

function InstallHint({ mode }: { mode: InstallMode }) {
  if (mode === null || mode === "chrome") return null;

  const content: Record<
    Exclude<InstallMode, null | "chrome">,
    { icon: ReactNode; title: string; body: ReactNode }
  > = {
    ios: {
      icon: <Share className="size-3.5" />,
      title: "Safari에서 홈 화면에 추가",
      body: (
        <ol className="mt-1.5 space-y-2">
          <li className="flex items-center gap-2.5">
            <StepBadge n={1} />
            <span>
              하단의{" "}
              <IosShareIcon className="mx-0.5 inline-block size-3.5 align-text-bottom text-primary" />{" "}
              <strong className="text-foreground">공유</strong> 버튼을 탭하세요
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <StepBadge n={2} />
            <span>
              <strong className="text-foreground">홈 화면에 추가</strong>를 선택하세요
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <StepBadge n={3} />
            <span>
              우측 상단의 <strong className="text-foreground">추가</strong>를 탭하세요
            </span>
          </li>
        </ol>
      ),
    },
    inAppIos: {
      icon: <Compass className="size-3.5" />,
      title: "인앱 브라우저에서는 설치할 수 없어요",
      body: (
        <>
          아래 <strong className="text-foreground">Safari로 열기</strong>를 누르거나,
          우측 메뉴(<strong className="text-foreground">⋯</strong>)에서{" "}
          <strong className="text-foreground">Safari로 열기</strong>를 선택한 뒤, 그
          화면에서 홈 화면에 추가해주세요.
        </>
      ),
    },
    inAppAndroid: {
      icon: <Compass className="size-3.5" />,
      title: "인앱 브라우저에서는 설치할 수 없어요",
      body: (
        <>
          아래 <strong className="text-foreground">Chrome에서 열기</strong>를 누르거나,
          우측 메뉴(<strong className="text-foreground">⋯</strong>)에서{" "}
          <strong className="text-foreground">다른 브라우저로 열기</strong>를
          선택하세요.
        </>
      ),
    },
    firefoxAndroid: {
      icon: <Share className="size-3.5" />,
      title: "Firefox에서 설치",
      body: (
        <>
          우측 상단의 <strong className="text-foreground">메뉴(⋮)</strong>를 열고{" "}
          <strong className="text-foreground">설치</strong> 또는{" "}
          <strong className="text-foreground">홈 화면에 추가</strong>를 눌러주세요.
        </>
      ),
    },
  };

  const { icon, title, body } = content[mode];

  return (
    <div className="mx-4 mb-4 rounded-md border bg-muted px-3 py-2.5 text-sm text-muted-foreground">
      <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
        {icon}
        {title}
      </div>
      {body}
    </div>
  );
}

function IosShareIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
