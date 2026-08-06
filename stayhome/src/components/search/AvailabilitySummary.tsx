import { BedDouble, CircleCheck, Clock } from "lucide-react";

import { diffDaysIso, formatKoMd } from "@/lib/utils";
import { TONE_TEXT } from "@/lib/availability-tone";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import {
  candidateProperties,
  placeLabel,
  type PlaceSelection,
} from "./place-selection";
import type { Committed, InventoryRow, ResortCatalogEntry } from "./types";

/**
 * 조회 결과 상단의 조건 줄 + 요약 스탯 행.
 *
 * 조건 줄은 사용자가 중요하다고 한 순서(날짜 → 숙소/위치)대로 눈에 처음 들어오게 둔다.
 * 예전엔 스탯 타일 *아래* 작은 회색 줄이라 어떤 조건의 결과인지 확인하려면 아래를
 * 훑어야 했다.
 */
export function AvailabilitySummary({
  rows,
  committed,
  place,
  catalog,
}: {
  rows: InventoryRow[];
  committed: Committed;
  place: PlaceSelection;
  catalog: ResortCatalogEntry[];
}) {
  const available = rows.filter((r) => r.available).length;
  const closingSoon = rows.filter((r) => r.available && r.closingSoon).length;

  const nights = diffDaysIso(committed.checkin, committed.checkout);

  // 행 수보다 "몇 개 지점에 자리가 있나"가 위치 중심 사고에 맞는 지표다.
  // 분모는 전체 지점이 아니라 **현재 필터 범위 안의** 지점 수 — 제주만 보고 있는데
  // 분모가 전국 지점 수면 비율이 아무 의미가 없다.
  const branchesWithAvailability = new Set(
    rows.filter((r) => r.available).map((r) => r.branchName),
  ).size;
  const branchesInScope = candidateProperties(place, catalog).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 px-0.5">
        <span className="font-mono text-sm font-medium tabular-nums">
          {formatKoMd(committed.checkin)}
          <span className="mx-1.5 text-muted-foreground">→</span>
          {formatKoMd(committed.checkout)}
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {nights}박
        </span>
        <Badge variant="outline">{placeLabel(place, catalog)}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={BedDouble}
          label="예약 가능 지점"
          value={`${branchesWithAvailability}/${branchesInScope}`}
        />
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
    </div>
  );
}
