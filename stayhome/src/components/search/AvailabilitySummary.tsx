import { BedDouble, CircleCheck, Clock, HelpCircle } from "lucide-react";

import { diffDaysIso, formatKoMd } from "@/lib/utils";
import { TONE_TEXT, toneOf } from "@/lib/availability-tone";
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
  now,
  committed,
  place,
  catalog,
}: {
  rows: InventoryRow[];
  /** 신선도 기준 시각 — 목록과 같은 값을 써야 요약의 숫자가 아래 배지와 어긋나지 않는다. */
  now: number;
  committed: Committed;
  place: PlaceSelection;
  catalog: ResortCatalogEntry[];
}) {
  // 화면에서 가장 크고 먼저 읽히는 숫자다. 그래서 여기서 세는 "예약 가능"은
  // `r.available`이 아니라 **확인된** 가용이어야 한다 — 13일 전에 가능했던 행을
  // 여기 합산하면 아래 목록을 아무리 정확히 고쳐도 사용자는 이 숫자를 먼저 믿는다.
  const tones = rows.map((r) => toneOf(r, now));
  const available = tones.filter(
    (t) => t === "available" || t === "closingSoon",
  ).length;
  const closingSoon = tones.filter((t) => t === "closingSoon").length;
  const unverified = tones.filter((t) => t === "unverified").length;

  const nights = diffDaysIso(committed.checkin, committed.checkout);

  // 행 수보다 "몇 개 지점에 자리가 있나"가 위치 중심 사고에 맞는 지표다.
  // 분모는 전체 지점이 아니라 **현재 필터 범위 안의** 지점 수 — 제주만 보고 있는데
  // 분모가 전국 지점 수면 비율이 아무 의미가 없다.
  const branchesWithAvailability = new Set(
    rows
      .filter((_, i) => tones[i] === "available" || tones[i] === "closingSoon")
      .map((r) => r.branchName),
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        {/* 0일 때도 항상 자리를 지킨다. 조건에 따라 나타났다 사라지면 "이번엔 확인
            필요가 없다"와 "그런 개념이 없다"가 구분되지 않는다. */}
        <StatCard
          icon={HelpCircle}
          label="확인 필요"
          value={unverified}
          unit="건"
          valueClassName={unverified > 0 ? TONE_TEXT.unverified : undefined}
        />
      </div>
    </div>
  );
}
