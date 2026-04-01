"use client";

import { Check, Coffee } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { TrackBadge } from "@/components/TrackBadge";
import { Session } from "@/types/agenda";
import { cn } from "@/lib/utils";

const trackLeftBorder: Record<number, string> = {
  1: "border-l-blue-500",
  2: "border-l-emerald-500",
  3: "border-l-purple-500",
};

const trackSelectedBg: Record<number, string> = {
  1: "bg-blue-500/5 dark:bg-blue-500/10",
  2: "bg-emerald-500/5 dark:bg-emerald-500/10",
  3: "bg-purple-500/5 dark:bg-purple-500/10",
};

interface AgendaCardProps {
  session: Session;
  selected: boolean;
  onToggle: (id: string) => void;
}

export function AgendaCard({ session, selected, onToggle }: AgendaCardProps) {
  if (session.isBreak) {
    return (
      <div className="flex items-center gap-2 py-3 px-4 rounded-lg border border-dashed border-muted-foreground/20 bg-muted/30">
        <Coffee className="size-3.5 text-muted-foreground/60" />
        <span className="text-xs text-muted-foreground font-medium">
          {session.title}
        </span>
      </div>
    );
  }

  return (
    <Card
      size="sm"
      className={cn(
        "cursor-pointer transition-all duration-150 border-l-[3px]",
        "active:scale-[0.98] active:transition-none",
        trackLeftBorder[session.track],
        selected
          ? cn(
              "ring-1 ring-primary/30 border-l-primary shadow-sm",
              trackSelectedBg[session.track]
            )
          : "hover:shadow-sm hover:ring-1 hover:ring-foreground/5"
      )}
      onClick={() => onToggle(session.id)}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(session.id);
        }
      }}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="mb-1.5">
              <TrackBadge track={session.track} />
            </div>
            <h3 className="text-sm font-semibold leading-snug mb-1 line-clamp-2">
              {session.title}
            </h3>
            <p className="text-xs text-muted-foreground truncate">
              {session.speaker}
            </p>
          </div>
          <div
            className={cn(
              "flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 mt-0.5",
              selected
                ? "bg-primary border-primary scale-100"
                : "border-muted-foreground/30 scale-90"
            )}
          >
            {selected && (
              <Check className="size-3 text-primary-foreground motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
