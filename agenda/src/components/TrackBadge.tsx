"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const trackConfig: Record<number, { label: string }> = {
  1: { label: "Analytics" },
  2: { label: "AI Agent" },
  3: { label: "Apps" },
};

export function TrackBadge({ track }: { track: number }) {
  const config = trackConfig[track];
  if (!config) return null;

  return (
    <Badge
      variant="outline"
      className="text-[10px] font-semibold tracking-wider uppercase h-4 px-1.5 rounded-sm text-muted-foreground"
    >
      {config.label}
    </Badge>
  );
}
