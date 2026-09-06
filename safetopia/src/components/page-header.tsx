import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 모든 페이지 최상단의 제목 블록. 페이지 스캐폴드는
 * `<div className="space-y-6"><PageHeader …/>…</div>` 형태로 통일한다.
 */
export function PageHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** 우측 정렬 액션 슬롯 (버튼 등). */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3 pb-1", className)}>
      <div className="min-w-0 space-y-1">
        {/* break-keep: 한글은 어절 중간에서 끊기면 안 된다. 360px에서 "관리자 대시보/드"로 갈렸다. */}
        <h1 className="font-heading text-2xl font-semibold tracking-tight break-keep">{title}</h1>
        {/* max-w-prose: 본문 컬럼이 1344px까지 넓어져서, 제한이 없으면 설명이 한 줄로 쭉 늘어난다. */}
        {description && (
          <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
