import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AgendaTone = "default" | "accent" | "muted";

export interface AgendaItem {
  id: string;
  time: string;
  title: string;
  subtitle?: string;
  tone?: AgendaTone;
  /** 제목 앞에 붙는 작은 상태 아이콘 (예: 강제예약 Shield) */
  icon?: ReactNode;
  trailing?: ReactNode;
}

export interface AgendaGroup {
  label: string;
  items: AgendaItem[];
}

const DOT_TONE: Record<AgendaTone, string> = {
  default: "bg-border",
  accent: "bg-primary",
  muted: "bg-muted-foreground/40",
};

export function AgendaRail({ groups }: { groups: AgendaGroup[] }) {
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="mb-2 text-xs font-medium tracking-wide text-muted-foreground">
            {g.label}
          </div>
          <ol className="relative space-y-3">
            {/* 연속 세로선 (점 뒤로 지나가며 ring-background로 가려짐) */}
            <span
              aria-hidden
              className="pointer-events-none absolute top-2 bottom-2 left-[5px] w-px bg-border"
            />
            {g.items.map((it) => (
              <li key={it.id} className="relative flex gap-3">
                <div className="flex w-2.5 shrink-0 justify-center">
                  <span
                    className={cn(
                      "mt-1 size-2.5 rounded-full ring-2 ring-background",
                      DOT_TONE[it.tone ?? "default"],
                    )}
                  />
                </div>
                <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs tabular-nums text-muted-foreground">
                      {it.time}
                    </div>
                    <div
                      className={cn(
                        "flex items-center gap-1.5 text-sm font-medium",
                        it.tone === "muted" && "text-muted-foreground",
                      )}
                    >
                      {it.icon}
                      <span className="truncate">{it.title}</span>
                    </div>
                    {it.subtitle && (
                      <div className="truncate text-xs text-muted-foreground">
                        {it.subtitle}
                      </div>
                    )}
                  </div>
                  {it.trailing && <div className="shrink-0">{it.trailing}</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
