"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const trackConfig: Record<number, { label: string; className: string }> = {
  1: {
    label: "Analytics",
    className:
      "bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-400 dark:border-blue-800",
  },
  2: {
    label: "AI Agent",
    className:
      "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-400 dark:border-emerald-800",
  },
  3: {
    label: "Apps",
    className:
      "bg-purple-500/10 text-purple-700 border-purple-200 dark:text-purple-400 dark:border-purple-800",
  },
};

export function TrackBadge({ track }: { track: number }) {
  const config = trackConfig[track];
  if (!config) return null;

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-semibold tracking-wider uppercase h-4 px-1.5 rounded-sm",
        config.className
      )}
    >
      {config.label}
    </Badge>
  );
}
