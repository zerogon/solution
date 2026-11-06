import { AlertTriangle, CalendarCheck } from "lucide-react";

import { LEAVE_DAYS_ERROR_MESSAGE, type LeaveDaysResult } from "@/lib/leave-days";
import { formatDays } from "@/lib/labels";
import { formatKoMd } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * 기록 폼의 계산 미리보기. 서버와 같은 `computeLeaveDays` 결과를 그린다 —
 * "차감 2일 · 제외: 9.19(토) 쉬는 날, 9.24(목) 추석" 그리고 등록 후 그 회차 잔여.
 *
 * 잔여가 모자라도 경고만 한다(장부는 막지 않는다). 직접 입력 중이면 그 값으로 잔여를 보여 준다.
 */
export function DaysPreview({
  result,
  remaining,
  periodLabel,
  manualDays,
}: {
  result: LeaveDaysResult | null;
  /** 그 회차의 현재 잔여. null = 알 수 없음(입사일 미설정 등) — 경고 없이 차감만 보여 준다. */
  remaining: number | null;
  /** "3년차" / "입사 전". null = 입사일 미설정. */
  periodLabel: string | null;
  /** 직접 입력 모드의 유효한 값. null이면 자동 계산을 쓴다. */
  manualDays: number | null;
}) {
  if (!result) {
    return (
      <div className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">
        날짜를 선택하면 차감 일수를 미리 계산합니다.
      </div>
    );
  }

  const days = manualDays ?? (result.ok ? result.days : null);
  const autoFailed = !result.ok;
  // 직접 입력 중이면 공휴일을 모르는 것(uncovered)은 더 이상 오류가 아니다.
  const tolerated = manualDays != null && autoFailed && ["uncovered", "no_working_day", "half_day_off"].includes(result.reason);

  if (days == null || (autoFailed && !tolerated)) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>{result.ok ? "차감 일수를 입력해주세요." : LEAVE_DAYS_ERROR_MESSAGE[result.reason]}</span>
      </div>
    );
  }

  const after = remaining == null ? null : remaining - days;
  const short = after != null && after < 0;
  return (
    <div
      className={cn(
        "space-y-1.5 rounded-lg border px-3 py-2.5 text-sm",
        short ? "border-amber-500/40 bg-amber-500/5" : "border-primary/30 bg-primary/5",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <CalendarCheck className={cn("size-4", short ? "text-amber-600" : "text-primary")} />
        <span>
          차감 <span className="font-mono font-semibold tabular-nums">{formatDays(days)}</span>
          {manualDays != null && <span className="text-muted-foreground">(직접 입력)</span>}
        </span>
        <span className="text-muted-foreground">·</span>
        {after == null ? (
          <span className="text-muted-foreground">
            {periodLabel == null ? "입사일을 입력하면 잔여를 보여 줍니다." : `${periodLabel} 잔여는 설정의 회차 표에서 봅니다.`}
          </span>
        ) : (
          <span className={cn(short && "text-amber-700")}>
            {periodLabel} 잔여 <span className="font-mono font-semibold tabular-nums">{formatDays(after)}</span>
          </span>
        )}
      </div>
      {result.ok && manualDays == null && result.skipped.length > 0 && (
        <p className="text-xs text-muted-foreground">
          제외:{" "}
          {result.skipped
            .map((s) => `${formatKoMd(s.iso)} ${s.reason === "closed" ? "쉬는 날" : (s.name ?? "공휴일")}`)
            .join(", ")}
        </p>
      )}
      {short && <p className="text-xs text-amber-700">{periodLabel} 발생 일수를 넘습니다. 그래도 등록할 수 있습니다.</p>}
    </div>
  );
}
