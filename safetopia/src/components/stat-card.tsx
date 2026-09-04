import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 요약 숫자 타일. 값은 앱 전체 관례대로 모노 + `tabular-nums`로 그려서
 * 값이 바뀔 때 자릿수가 흔들리지 않게 한다.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  valueClassName,
  className,
}: {
  icon?: LucideIcon;
  label: string;
  value: number | string;
  unit?: string;
  /** 상태색이 필요한 경우 `TONE_TEXT`의 값을 넘긴다. */
  valueClassName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5",
        className,
      )}
    >
      {Icon && (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4.5" />
        </div>
      )}
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={cn(
            "font-mono text-xl leading-tight font-semibold tabular-nums",
            valueClassName,
          )}
        >
          {value}
          {unit && (
            <span className="ml-0.5 font-sans text-xs font-normal text-muted-foreground">
              {unit}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
