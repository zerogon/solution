"use client";

import { useEffect, useRef } from "react";
import { markAnnouncementReadAction } from "@/actions/announcements";

/**
 * 학생·선생님이 공지 상세를 열면 1회 읽음 처리한다.
 * 피드백 다이얼로그의 open-time mark-read와 동일한 동작 — 미읽음일 때만 호출.
 */
export function MarkAnnouncementRead({
  announcementId,
  unread,
}: {
  announcementId: string;
  unread: boolean;
}) {
  const done = useRef(false);

  useEffect(() => {
    if (!unread || done.current) return;
    done.current = true;
    void markAnnouncementReadAction({ announcementId });
  }, [announcementId, unread]);

  return null;
}
