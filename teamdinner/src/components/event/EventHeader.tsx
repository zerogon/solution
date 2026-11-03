"use client";

import { ExternalLinkIcon, MoreVerticalIcon, RefreshCwIcon, Share2Icon, UserRoundPenIcon } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { AppMark } from "@/components/app-mark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { EventDto } from "@/lib/events";

interface Props {
  event: EventDto;
  memberName: string | null;
  onChangeName: () => void;
  onSync: () => void;
  syncing?: boolean;
}

export function EventHeader({ event, memberName, onChangeName, onSync, syncing }: Props) {
  const share = async () => {
    const url = window.location.href;
    const text = `${event.title} — 먹고 싶은 메뉴를 미리 담아 주세요`;
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, text, url });
        return;
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("링크를 복사했습니다");
    } catch {
      toast.error("복사하지 못했습니다. 주소창의 링크를 직접 복사해 주세요.");
    }
  };

  return (
    <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 py-2.5">
        <Link href="/" aria-label="홈" className="shrink-0">
          <AppMark className="size-9" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base leading-tight font-semibold">{event.title}</h1>
          <p className="truncate text-xs text-muted-foreground">
            <a
              href={event.naverUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
            >
              {event.placeName}
              <ExternalLinkIcon className="size-3" />
            </a>
            {event.placeCategory && <> · {event.placeCategory}</>}
            {memberName && (
              <>
                {" · "}
                <span className="text-foreground">{memberName}</span>
              </>
            )}
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={share} aria-label="링크 공유">
          <Share2Icon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="더 보기" />}>
            <MoreVerticalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onChangeName}>
              <UserRoundPenIcon /> 이름 바꾸기
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSync} disabled={syncing}>
              <RefreshCwIcon className={syncing ? "animate-spin" : undefined} /> 네이버 메뉴 다시 가져오기
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {event.placeAddress && (
        <p className="mx-auto w-full max-w-2xl truncate px-4 pb-2 text-xs text-muted-foreground">{event.placeAddress}</p>
      )}
    </header>
  );
}
