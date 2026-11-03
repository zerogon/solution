"use client";

import {
  ExternalLinkIcon,
  ListIcon,
  MoreVerticalIcon,
  PencilIcon,
  RefreshCwIcon,
  Share2Icon,
  Trash2Icon,
  UserRoundPenIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AppMark } from "@/components/app-mark";
import { ShareDialog } from "@/components/event/ShareDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dDayLabel, formatKoDate, todayKstIso } from "@/lib/dates";
import type { EventDto } from "@/lib/events";

interface Props {
  event: EventDto;
  memberName: string | null;
  /** 메뉴를 하나라도 담은 사람 수. */
  memberCount: number;
  onChangeName: () => void;
  onSync: () => void;
  syncing?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function EventHeader({ event, memberName, memberCount, onChangeName, onSync, syncing, onEdit, onDelete }: Props) {
  // 날짜 표시는 클라이언트에서만 "오늘" 기준이 필요하다 — 헤더는 클라이언트 컴포넌트라 바로 계산한다.
  const dday = dDayLabel(event.eventDate, todayKstIso());
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const openShare = () => {
    setShareUrl(window.location.href);
    setShareOpen(true);
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
        <Button variant="ghost" size="icon" nativeButton={false} render={<Link href="/" />} aria-label="회식 목록으로">
          <ListIcon />
        </Button>
        <Button variant="outline" size="icon" onClick={openShare} aria-label="링크 공유">
          <Share2Icon />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="더 보기" />}>
            <MoreVerticalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48 whitespace-nowrap">
            <DropdownMenuItem onClick={onChangeName}>
              <UserRoundPenIcon /> 이름 바꾸기
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSync} disabled={syncing}>
              <RefreshCwIcon className={syncing ? "animate-spin" : undefined} /> 네이버 메뉴 다시 가져오기
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onEdit}>
              <PencilIcon /> 날짜·인원·제목 수정
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2Icon /> 회식 삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-2 px-4 pb-2 text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">
          {formatKoDate(event.eventDate)} <span className="text-foreground">{dday}</span>
        </span>
        <span>·</span>
        <span>
          예상 <b className="font-mono text-foreground tabular-nums">{event.headcount}</b>명 ·{" "}
          <b className="font-mono text-foreground tabular-nums">{memberCount}</b>명 담음
        </span>
        {event.placeAddress && (
          <>
            <span>·</span>
            <span className="truncate">{event.placeAddress}</span>
          </>
        )}
      </p>
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} title={event.title} url={shareUrl} />
    </header>
  );
}
