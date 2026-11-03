"use client";

import { CalendarDaysIcon, MoreVerticalIcon, PencilIcon, Trash2Icon, UsersIcon } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dDayLabel, formatKoDate, formatKoDateWithYear } from "@/lib/dates";
import type { EventSummary } from "@/lib/events";
import { formatKrw } from "@/lib/price";
import { cn } from "@/lib/utils";

interface Props {
  event: EventSummary;
  today: string;
  past: boolean;
  onEdit: (e: EventSummary) => void;
  onDelete: (e: EventSummary) => void;
}

export function EventCard({ event, today, past, onEdit, onDelete }: Props) {
  const sameYear = event.eventDate.slice(0, 4) === today.slice(0, 4);
  const dateLabel = sameYear ? formatKoDate(event.eventDate) : formatKoDateWithYear(event.eventDate);
  const dday = dDayLabel(event.eventDate, today);

  return (
    <li className={cn("relative rounded-xl bg-card ring-1 ring-foreground/10 transition-colors hover:bg-muted/40", past && "opacity-80")}>
      {/* 카드 전체가 링크. 드롭다운 버튼은 z-10으로 위에 둔다. */}
      <Link href={`/e/${event.slug}`} className="absolute inset-0 rounded-xl" aria-label={`${event.title} 열기`} />
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate font-medium">{event.title}</h3>
            <Badge variant={past ? "secondary" : dday === "오늘" ? "default" : "outline"} className="h-5 px-1.5 font-mono text-[11px] tabular-nums">
              {dday}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {event.placeName}
            {event.placeCategory && ` · ${event.placeCategory}`}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDaysIcon className="size-3.5" />
              <span className="font-mono tabular-nums">{dateLabel}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <UsersIcon className="size-3.5" />
              예상 <b className="font-mono text-foreground tabular-nums">{event.headcount}</b>명 ·{" "}
              <b className="font-mono text-foreground tabular-nums">{event.participantCount}</b>명 담음
            </span>
            <span className="font-mono font-semibold text-foreground tabular-nums">
              {formatKrw(event.estimatedTotal)}
              {event.hasUnpriced && "+"}
            </span>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" className="relative z-10 -mt-1 -mr-1 shrink-0" aria-label="회식 메뉴" />}
          >
            <MoreVerticalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48 whitespace-nowrap">
            <DropdownMenuItem onClick={() => onEdit(event)}>
              <PencilIcon /> 날짜·인원·제목 수정
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(event)}>
              <Trash2Icon /> 회식 삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
