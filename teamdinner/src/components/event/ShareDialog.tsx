"use client";

import { CheckIcon, CopyIcon, Share2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** 공유할 절대 URL. 열릴 때 호출자가 `window.location.href`로 넘긴다. */
  url: string;
}

/**
 * 링크 공유 — 링크를 눈에 보이게 두고 「링크 복사」를 주 행동으로 한다.
 *
 * `navigator.share`만 부르면 맥 Chrome은 OS 공유 창을 띄우고(복사가 아니다),
 * `http://`(LAN IP 등 비보안 컨텍스트)에서는 `navigator.clipboard`가 없어 조용히 실패한다.
 * 그래서 ① clipboard API → ② 입력창 선택 + execCommand("copy") 순으로 복사하고,
 * 둘 다 안 되면 입력창을 전체 선택해 둬서 ⌘C/길게 눌러 복사할 수 있게 한다.
 */
export function ShareDialog({ open, onOpenChange, title, url }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const selectAll = () => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
    el.setSelectionRange(0, el.value.length);
  };

  const copy = async () => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        selectAll();
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      toast.success("링크를 복사했습니다", { description: "팀 채팅방에 붙여넣어 주세요." });
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      selectAll();
      toast.error("자동 복사가 막혀 있습니다", { description: "선택된 링크를 직접 복사(⌘C / 길게 누르기)해 주세요." });
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text: `${title} — 먹고 싶은 메뉴를 미리 담아 주세요`, url });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error("공유 창을 열지 못했습니다. 링크 복사를 이용해 주세요.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>팀원에게 링크 공유</DialogTitle>
          <DialogDescription>이 링크를 연 사람은 이름만 적고 메뉴를 담을 수 있습니다.</DialogDescription>
        </DialogHeader>
        <Input
          ref={inputRef}
          readOnly
          value={url}
          onFocus={selectAll}
          onClick={selectAll}
          className="h-10 font-mono text-xs"
          aria-label="회식 링크"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {canNativeShare && (
            <Button variant="outline" onClick={nativeShare}>
              <Share2Icon data-icon="inline-start" /> 다른 앱으로 공유
            </Button>
          )}
          <Button onClick={copy}>
            {copied ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
            {copied ? "복사됨" : "링크 복사"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
