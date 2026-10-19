import { Clock, Gift, PlaneTakeoff, Undo2 } from "lucide-react";

import { StatCard } from "@/components/stat-card";
import type { BalanceSummary } from "@/lib/leave-balance";
import { cn } from "@/lib/utils";

/** 엑셀의 네 칸 — 부여·이월·사용·잔여. 잔여가 음수면 빨갛다. 홈과 연차 기록이 같이 쓴다. */
export function YearSummaryCards({ summary }: { summary: BalanceSummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <StatCard
        icon={PlaneTakeoff}
        label="잔여"
        value={summary.remaining}
        unit="일"
        valueClassName={cn(summary.remaining < 0 ? "text-destructive" : "text-primary")}
      />
      <StatCard icon={Clock} label="사용" value={summary.used} unit="일" />
      <StatCard icon={Gift} label="부여" value={summary.granted} unit="일" />
      <StatCard icon={Undo2} label="이월" value={summary.carriedOver} unit="일" />
    </div>
  );
}
