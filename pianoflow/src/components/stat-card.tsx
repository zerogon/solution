import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  suffix,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  suffix?: string;
  icon?: LucideIcon;
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="font-mono text-3xl font-semibold tracking-tight tabular-nums">
            {value}
            {suffix && (
              <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">
                {suffix}
              </span>
            )}
          </p>
        </div>
        {Icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4.5" />
          </span>
        )}
      </CardContent>
    </Card>
  );
}
