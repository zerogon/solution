import { cn } from "@/lib/utils";

/**
 * 내비게이션/탭 옆에 붙는 숫자 배지. 0이면 아무것도 그리지 않고, 두 자리를 넘으면
 * `9+`로 접는다. 숫자는 앱 전체 관례대로 `font-mono tabular-nums`.
 */
export function NavBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (!count) return null;
  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-mono text-[10px] leading-none font-semibold text-primary-foreground tabular-nums",
        className,
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
