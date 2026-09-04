import { Users } from "lucide-react";

import { cn, formatKoMd } from "@/lib/utils";
import type { DayHeadcount } from "@/lib/headcount";

/**
 * "근무 예정 3/5명" 칩. 여러 날짜면 가장 적은 날 기준으로 요약한다.
 * `minStaff`가 있고 그 아래로 내려가면 경고색(Phase 2 규칙을 미리 적용).
 */
export function HeadcountChip({ worst, minStaff }: { worst: DayHeadcount | null; minStaff: number | null }) {
  if (!worst) return null;
  const warn = minStaff !== null && worst.expectedWorking < minStaff;
  const tight = !warn && worst.expectedWorking <= 1;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
        warn
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : tight
            ? "border-amber-300 bg-amber-50 text-amber-800"
            : "border-border text-muted-foreground",
      )}
      title={`${formatKoMd(worst.date)} 재직 ${worst.staff}명 − 확정 휴가 ${worst.approvedOff} − 대기 ${worst.pendingOff}`}
    >
      <Users className="size-3" />
      근무 예정{" "}
      <span className="font-mono font-semibold tabular-nums">
        {worst.expectedWorking}/{worst.staff}
      </span>
      {minStaff !== null && <span className="opacity-70">(최소 {minStaff})</span>}
    </span>
  );
}
