"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "pianoflow:install-dismissed";

export function PwaInstallPrompt() {
  const [event, setEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const dismissed = window.localStorage.getItem(DISMISS_KEY);
    if (dismissed) return;

    const ios = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    if (ios) {
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

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
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
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" className="space-y-3">
        <SheetHeader>
          <SheetTitle>홈 화면에 추가</SheetTitle>
          <SheetDescription>
            앱처럼 빠르게 접속할 수 있습니다.
          </SheetDescription>
        </SheetHeader>
        {isIos ? (
          <p className="text-sm">
            Safari 하단의 <strong>공유</strong> 버튼을 눌러{" "}
            <strong>홈 화면에 추가</strong>를 선택해주세요.
          </p>
        ) : (
          <div className="flex gap-2">
            <Button onClick={install}>지금 설치</Button>
            <Button variant="outline" onClick={dismiss}>
              나중에
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
