"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * 예약확정 메일 화면의 껍데기.
 *
 * 본문(`MailComposer`)은 첫 렌더부터 `localStorage`(마지막 리조트 · 서명 · 로고 ·
 * 고정 안내 이미지)를 읽는다. 서버에서 그리면 그 값이 없는 HTML이 먼저 나가 하이드레이션이
 * 어긋나므로 `ssr: false`로 브라우저에서만 그린다. `ssr: false`는 클라이언트 컴포넌트에서만
 * 쓸 수 있어 이 파일이 따로 있다.
 */
const MailComposer = dynamic(
  () => import("./MailComposer").then((m) => m.MailComposer),
  {
    ssr: false,
    loading: () => (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    ),
  },
);

export function MailView() {
  return <MailComposer />;
}
