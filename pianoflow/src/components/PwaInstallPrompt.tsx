"use client";

import Image from "next/image";
import { useEffect, useId, useState, type ReactNode } from "react";
import { BellRing, Share, Smartphone, Zap } from "lucide-react";

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

const DISMISS_DATE_KEY = "pianoflow:install-dismissed-date";

type InstallMode =
  | "chrome"
  | "ios"
  | "macSafari"
  | "firefoxAndroid"
  | "firefoxDesktop"
  | null;

function getLocalDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function detectInstallMode(): InstallMode {
  if (typeof window === "undefined") return null;

  const ua = window.navigator.userAgent;
  const platform = window.navigator.platform;
  const maxTouchPoints = window.navigator.maxTouchPoints ?? 0;

  // iPadOS 13+ Safari with "request desktop site" (default ON) reports a Mac UA,
  // so combine UA sniff with the touch-on-Mac heuristic.
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (platform === "MacIntel" && maxTouchPoints > 1);
  if (isIos) return "ios";

  // Firefox iOS uses "FxiOS" and is already captured by the iOS branch above.
  if (/firefox/i.test(ua) && !/fxios/i.test(ua)) {
    return /android/i.test(ua) ? "firefoxAndroid" : "firefoxDesktop";
  }

  // Safari on macOS — exclude Chrome/Edge/Opera and any Chromium-based UA.
  const isSafariEngine =
    /safari/i.test(ua) && !/chrome|chromium|edg\/|opr\//i.test(ua);
  const isMac = /macintosh|mac os x/i.test(ua) && maxTouchPoints <= 1;
  if (isSafariEngine && isMac) return "macSafari";

  // Chromium-based browsers: defer to the beforeinstallprompt event.
  return null;
}

export function PwaInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [installMode, setInstallMode] = useState<InstallMode>(null);
  const [dontShowToday, setDontShowToday] = useState(false);
  const checkboxId = useId();

  useEffect(() => {
    // Register the service worker on every visit — Chrome's `beforeinstallprompt`
    // criteria require an active SW with a fetch handler.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {});
    }

    const dismissedDate = window.localStorage.getItem(DISMISS_DATE_KEY);
    if (dismissedDate && dismissedDate === getLocalDateString()) return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const mode = detectInstallMode();

    // Non-Chromium browsers don't fire `beforeinstallprompt`; show the hint sheet immediately.
    if (mode !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInstallMode(mode);
      setOpen(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
      setInstallMode("chrome");
      setOpen(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function persistIfNeeded() {
    if (dontShowToday) {
      window.localStorage.setItem(DISMISS_DATE_KEY, getLocalDateString());
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

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="bottom" className="gap-0 pb-4 sm:mx-auto sm:max-w-md sm:rounded-t-2xl">
        <SheetHeader className="flex flex-row items-start gap-3 pr-10">
          <div className="relative size-12 shrink-0 overflow-hidden rounded-2xl border border-border bg-background">
            <Image
              src="/icons/icon-192.png"
              alt="PianoFlow"
              fill
              sizes="48px"
              className="object-cover"
            />
          </div>
          <div className="flex flex-1 flex-col gap-0.5">
            <SheetTitle>홈 화면에 추가</SheetTitle>
            <SheetDescription>앱처럼 빠르게 접속하세요.</SheetDescription>
          </div>
        </SheetHeader>

        <ul className="space-y-2 px-4 pb-4">
          <li className="flex items-center gap-2.5 text-sm text-foreground">
            <Zap className="size-4 text-primary" />
            빠른 실행 속도
          </li>
          <li className="flex items-center gap-2.5 text-sm text-foreground">
            <Smartphone className="size-4 text-primary" />
            홈 화면 바로가기
          </li>
          <li className="flex items-center gap-2.5 text-sm text-foreground">
            <BellRing className="size-4 text-primary" />
            알림으로 일정 확인
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
              onCheckedChange={(checked) => setDontShowToday(checked)}
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
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function InstallHint({ mode }: { mode: InstallMode }) {
  if (mode === null || mode === "chrome") return null;

  const content: Record<
    Exclude<InstallMode, null | "chrome">,
    { title: string; body: ReactNode }
  > = {
    ios: {
      title: "Safari에서 설치",
      body: (
        <>
          하단의 <strong className="text-foreground">공유</strong> 버튼을 누른 뒤{" "}
          <strong className="text-foreground">홈 화면에 추가</strong>를 선택해주세요.
        </>
      ),
    },
    macSafari: {
      title: "Safari에서 설치",
      body: (
        <>
          상단 메뉴의 <strong className="text-foreground">파일</strong> →{" "}
          <strong className="text-foreground">Dock에 추가…</strong>를 선택하면 Dock에서 앱처럼
          실행할 수 있어요. (Safari 17 이상)
        </>
      ),
    },
    firefoxAndroid: {
      title: "Firefox에서 설치",
      body: (
        <>
          우측 상단의 <strong className="text-foreground">메뉴(⋮)</strong>를 열고{" "}
          <strong className="text-foreground">설치</strong> 또는{" "}
          <strong className="text-foreground">홈 화면에 추가</strong>를 눌러주세요.
        </>
      ),
    },
    firefoxDesktop: {
      title: "Firefox에서 빠르게 접속",
      body: (
        <>
          Firefox 데스크톱은 PWA 설치를 기본 지원하지 않습니다.{" "}
          <strong className="text-foreground">Ctrl/Cmd + D</strong>로 북마크에 추가하거나,{" "}
          <em>PWAs for Firefox</em> 확장을 설치하면 앱처럼 사용할 수 있어요.
        </>
      ),
    },
  };

  const { title, body } = content[mode];

  return (
    <div className="mx-4 mb-4 rounded-md border border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground">
      <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
        <Share className="size-3.5" />
        {title}
      </div>
      {body}
    </div>
  );
}
