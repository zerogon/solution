"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Bell, Compass, Share, Smartphone, Zap } from "lucide-react";

import { AppMark } from "@/components/app-mark";
import {
  detectInstallMode,
  isDesktop,
  readInstallEnv,
  type InstallMode,
} from "@/lib/install-mode";
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

// 키에 v2를 붙여 이전 키에 남아 있던 "오늘 하루 보지 않기" 플래그를 무효화한다.
// 시트가 안 뜨던 기간에 체크해 둔 기기들이 고친 뒤에도 계속 막혀 있으면 안 된다.
const DISMISS_DATE_KEY = "safetopia:install-dismissed-date-v2";

/**
 * 같은 탭 세션에서 시트를 한 번만 띄우기 위한 표식.
 *
 * 시트는 `/login`과 로그인 뒤 셸 레이아웃 양쪽에 마운트된다. 이 가드가 없으면 로그인
 * 화면에서 한 번 본 사용자가 로그인하자마자(`router.replace`로 셸이 새로 마운트되며)
 * 같은 시트를 곧바로 다시 본다. `sessionStorage`라 탭을 닫으면 풀린다 —
 * "오늘 하루 보지 않기"(`localStorage`, 사용자가 명시적으로 고른 것)와는 역할이 다르다.
 */
const SHOWN_SESSION_KEY = "safetopia:install-shown-session";

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

function wasShownThisSession(): boolean {
  try {
    return window.sessionStorage.getItem(SHOWN_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function markShownThisSession() {
  try {
    window.sessionStorage.setItem(SHOWN_SESSION_KEY, "1");
  } catch {
    // 시크릿 모드 등. 기록 못 하면 다음 마운트에서 한 번 더 뜨는 데서 그친다.
  }
}

/**
 * `?install` 이 붙어 있으면 "오늘 하루 보지 않기"·세션 1회 가드·PC 억제를 모두 무시한다.
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

export function PwaInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [installMode, setInstallMode] = useState<InstallMode>(null);
  const [dontShowToday, setDontShowToday] = useState(false);
  const checkboxId = useId();

  useEffect(() => {
    const forced = isForced();
    if (!forced && (isDismissedToday() || wasShownThisSession())) return;

    // 이미 설치된 앱 안에서는 `?install`로도 띄우지 않는다 — 홈 화면에 추가할 것이 없다.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    // PC는 대상이 아니다 — 홈 화면에 추가할 홈 화면이 없다.
    const env = readInstallEnv();
    if (!forced && isDesktop(env)) return;

    const mode = detectInstallMode(env);
    markShownThisSession();

    // 비Chromium 브라우저는 beforeinstallprompt를 쏘지 않으므로 즉시 안내를 띄운다.
    if (mode !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInstallMode(mode);
      setOpen(true);
      return;
    }

    // Chromium. 여기서 `beforeinstallprompt`를 **기다리지 않는다** — 이미 설치돼
    // 있거나 Chrome이 설치 조건을 아직 인정하지 않으면 그 이벤트는 영영 오지 않고,
    // 기다리는 동안 시트는 한 번도 뜨지 않는다. 원클릭이 안 되면 메뉴 경로라도 안내한다.
    if (deferredPrompt) {
      setEvent(deferredPrompt);
      setInstallMode("chrome");
    } else {
      setInstallMode("chromeManual");
    }
    setOpen(true);

    // 이벤트가 늦게 도착하면 안내를 "지금 설치" 버튼으로 승격시킨다. 시트는 이미 떠 있다.
    const handler = (e: Event) => {
      e.preventDefault();
      const evt = e as BeforeInstallPromptEvent;
      deferredPrompt = evt;
      setEvent(evt);
      setInstallMode("chrome");
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
    chromeManual: {
      icon: <Share className="size-3.5" />,
      title: "브라우저 메뉴에서 홈 화면에 추가",
      body: (
        <>
          우측 상단의 <strong className="text-foreground">메뉴(⋮)</strong>를 열고{" "}
          <strong className="text-foreground">앱 설치</strong> 또는{" "}
          <strong className="text-foreground">홈 화면에 추가</strong>를 눌러주세요.
          <br />
          항목이 보이지 않는다면 이미 설치돼 있는 것입니다.
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
