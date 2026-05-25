"use client";

import Image from "next/image";
import { useEffect, useId, useState } from "react";
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

function getLocalDateString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function PwaInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [isIos, setIsIos] = useState(false);
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

    // iPadOS 13+ Safari reports a Mac UA when "request desktop site" is on
    // (the default), so combine UA sniff with the touch-on-Mac heuristic.
    const ua = window.navigator.userAgent;
    const ios =
      /iphone|ipad|ipod/i.test(ua) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    if (ios) {
      // iOS doesn't fire `beforeinstallprompt`, so we have to open the sheet
      // directly after detecting the platform on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsIos(true);
      setOpen(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setEvent(e as BeforeInstallPromptEvent);
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

        {isIos && (
          <div className="mx-4 mb-4 rounded-md border border-border bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
              <Share className="size-3.5" />
              Safari에서 설치
            </div>
            하단의 <strong className="text-foreground">공유</strong> 버튼을 누른 뒤{" "}
            <strong className="text-foreground">홈 화면에 추가</strong>를 선택해주세요.
          </div>
        )}

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
            {!isIos && (
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
