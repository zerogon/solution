import { BedDouble, CircleCheck, Clock } from "lucide-react";

import { TONE_TEXT } from "@/lib/availability-tone";
import { StatCard } from "@/components/stat-card";
import type { InventoryRow } from "./types";

/** 조회 결과 상단의 요약 스탯 행. */
export function AvailabilitySummary({ rows }: { rows: InventoryRow[] }) {
  const available = rows.filter((r) => r.available).length;
  const closingSoon = rows.filter((r) => r.available && r.closingSoon).length;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard icon={BedDouble} label="수집된 객실" value={rows.length} unit="건" />
      <StatCard
        icon={CircleCheck}
        label="예약 가능"
        value={available}
        unit="건"
        valueClassName={available > 0 ? TONE_TEXT.available : undefined}
      />
      <StatCard
        icon={Clock}
        label="마감임박"
        value={closingSoon}
        unit="건"
        valueClassName={closingSoon > 0 ? TONE_TEXT.closingSoon : undefined}
      />
    </div>
  );
}
