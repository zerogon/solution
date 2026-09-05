import { AlertTriangle, CalendarCheck } from "lucide-react";

import { LEAVE_DAYS_ERROR_MESSAGE, type LeaveDaysResult } from "@/lib/leave-days";
import { formatDays } from "@/lib/labels";
import { formatKoMd } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * 신청 폼의 계산 미리보기. 서버와 같은 `computeLeaveDays` 결과를 그린다 —
 * "차감 2.0일 · 제외: 9.15(월) 지점 휴무, 9.17(수) 추석" 그리고 신청 후 잔여.
 */
export function DaysPreview({
  result,
  remaining,
}: {
  result: LeaveDaysResult | null;
  remaining: number;
}) {
  if (!result) {
    return (
      <div className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
        날짜를 선택하면 차감 일수를 미리 계산합니다.
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>{LEAVE_DAYS_ERROR_MESSAGE[result.reason]}</span>
      </div>
    );
  }

  const after = remaining - result.days;
  const short = after < 0;
  return (
    <div
      className={cn(
        "space-y-1.5 rounded-lg border px-3 py-2.5 text-sm",
        short ? "border-destructive/30 bg-destructive/5" : "border-primary/30 bg-primary/5",
      )}
    >
      <div className="flex items-center gap-2">
        <CalendarCheck className={cn("size-4", short ? "text-destructive" : "text-primary")} />
        <span>
          차감 <span className="font-mono font-semibold tabular-nums">{formatDays(result.days)}</span>
        </span>
        <span className="text-muted-foreground">·</span>
        <span className={cn(short && "text-destructive")}>
          신청 후 잔여 <span className="font-mono font-semibold tabular-nums">{formatDays(after)}</span>
        </span>
      </div>
      {result.skipped.length > 0 && (
        <p className="text-xs text-muted-foreground">
          제외:{" "}
          {result.skipped
            .map((s) => `${formatKoMd(s.iso)} ${s.reason === "closed" ? "지점 휴무" : (s.name ?? "공휴일")}`)
            .join(", ")}
        </p>
      )}
      {short && <p className="text-xs text-destructive">잔여 연차를 초과합니다.</p>}
    </div>
  );
}
