import { cn } from "@/lib/utils";

/**
 * 네비게이션 미읽음 카운트 필. HeaderNav/BottomTabBar에 중복돼 있던 마크업을 통합.
 * count <= 0이면 렌더하지 않는다. 위치 보정은 className으로 전달.
 */
export function NavBadge({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-mono text-[10px] leading-none font-semibold tabular-nums text-destructive-foreground",
        className,
      )}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
