"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { markAnnouncementsReadAction } from "@/actions/announcements";
import { formatKstDate } from "@/lib/slots";

export type PopupAnnouncement = {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  publishedAt: Date | null;
  createdAt: Date;
};

function dateLabel(d: Date) {
  return formatKstDate(d).replace(/-/g, ".");
}

/**
 * 학생 홈 진입 시 안 읽은 공지가 있으면 자동으로 뜨는 팝업.
 * 닫으면(확인/X/바깥 클릭) 표시된 공지를 모두 읽음 처리 → 다음 진입부터 재노출 안 됨.
 */
export function AnnouncementPopup({
  announcements,
}: {
  announcements: PopupAnnouncement[];
}) {
  const [open, setOpen] = useState(announcements.length > 0);
  const [, startTransition] = useTransition();

  if (announcements.length === 0) return null;

  function onOpenChange(next: boolean) {
    if (!next) {
      // 닫는 순간 표시된 공지 전체를 읽음 처리
      startTransition(async () => {
        await markAnnouncementsReadAction({
          announcementIds: announcements.map((a) => a.id),
        });
      });
    }
    setOpen(next);
  }

  const count = announcements.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            새 공지사항{count > 1 ? ` ${count}건` : ""}
          </DialogTitle>
          <DialogDescription>
            확인하지 않은 공지가 있습니다.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-[60vh] space-y-3 overflow-y-auto">
          {announcements.map((a) => (
            <li key={a.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="flex items-center gap-1.5 font-medium">
                  {a.isPinned && (
                    <Pin aria-label="중요" className="size-3.5 shrink-0 text-primary" />
                  )}
                  {a.title}
                </h3>
                {a.isPinned && (
                  <Badge variant="secondary" className="shrink-0">
                    중요
                  </Badge>
                )}
              </div>
              <p className="mt-1 font-mono text-[11px] tabular-nums text-muted-foreground">
                {dateLabel(a.publishedAt ?? a.createdAt)}
              </p>
              <p className="mt-2 line-clamp-4 text-sm break-words whitespace-pre-wrap text-foreground">
                {a.content}
              </p>
              <Link
                href={`/student/announcements/${a.id}`}
                className="mt-1.5 inline-block text-xs font-medium text-primary hover:underline"
              >
                자세히 보기
              </Link>
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Link
            href="/student/announcements"
            className={buttonVariants({ variant: "outline" })}
          >
            전체 공지 보기
          </Link>
          <Button onClick={() => onOpenChange(false)}>확인</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
