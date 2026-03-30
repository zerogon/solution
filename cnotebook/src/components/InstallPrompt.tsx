"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { XIcon } from "./Icons";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "cnote-install-dismiss";

function isDismissedToday(): boolean {
  const stored = localStorage.getItem(DISMISS_KEY);
  if (!stored) return false;
  const dismissedDate = new Date(stored).toDateString();
  const today = new Date().toDateString();
  return dismissedDate === today;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Mac") && "ontouchend" in document)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && (navigator as unknown as { standalone: boolean }).standalone)
  );
}

export default function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<"android" | "ios" | null>(null);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    if (isDismissedToday()) return;

    if (isIOS()) {
      setPlatform("ios");
      setVisible(true);
      return;
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      if (isDismissedToday()) return;
      setPlatform("android");
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  const handleInstall = useCallback(async () => {
    if (platform === "ios") {
      return;
    }

    const prompt = deferredPromptRef.current;
    if (!prompt) return;

    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    deferredPromptRef.current = null;
  }, [platform]);

  const handleDismissToday = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setVisible(false);
  }, []);

  const handleClose = useCallback(() => {
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-overlay backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="w-full max-w-sm mx-4 mb-4 sm:mb-0 rounded-2xl bg-card p-6 shadow-modal animate-slide-up">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-surface-900">앱 설치</h3>
              <p className="text-xs text-surface-500">홈 화면에 추가하기</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600"
          >
            <XIcon size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="mt-4">
          {platform === "ios" ? (
            <div className="space-y-3">
              <p className="text-sm text-surface-600">
                Character Notebook을 홈 화면에 추가하면 앱처럼 바로 사용할 수 있습니다.
              </p>
              <div className="rounded-xl bg-surface-50 p-3.5 space-y-2.5">
                <div className="flex items-center gap-2.5 text-sm text-surface-700">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">1</span>
                  <span>하단의 <ShareIcon /> <strong>공유</strong> 버튼을 탭하세요</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm text-surface-700">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">2</span>
                  <span><strong>홈 화면에 추가</strong>를 선택하세요</span>
                </div>
                <div className="flex items-center gap-2.5 text-sm text-surface-700">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">3</span>
                  <span>우측 상단의 <strong>추가</strong>를 탭하세요</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-surface-600">
              Character Notebook을 홈 화면에 설치하면 앱처럼 빠르게 접근할 수 있습니다.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-col gap-2">
          {platform === "android" && (
            <button
              onClick={handleInstall}
              className="w-full rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
            >
              설치하기
            </button>
          )}
          <div className="flex items-center justify-between">
            <button
              onClick={handleDismissToday}
              className="text-xs text-surface-400 transition-colors hover:text-surface-600"
            >
              오늘 하루 보지 않기
            </button>
            <button
              onClick={handleClose}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-surface-600 transition-colors hover:bg-surface-100"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShareIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block align-text-bottom text-primary-600"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}
