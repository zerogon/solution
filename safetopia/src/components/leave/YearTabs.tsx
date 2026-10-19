import Link from "next/link";
import { cn } from "@/lib/utils";

/** 연도 칩. 바꾸면 URL(`?year=`)만 갱신하고 서버 컴포넌트가 다시 읽는다. */
export function YearTabs({ years, current, basePath }: { years: number[]; current: number; basePath: string }) {
  return (
    <nav aria-label="연도" className="flex flex-wrap gap-1.5">
      {years.map((y) => (
        <Link
          key={y}
          href={`${basePath}?year=${y}`}
          aria-current={y === current ? "page" : undefined}
          className={cn(
            "rounded-full border px-3 py-1 font-mono text-sm tabular-nums transition-colors",
            y === current
              ? "border-primary bg-primary/10 font-semibold text-primary"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          {y}
        </Link>
      ))}
    </nav>
  );
}
