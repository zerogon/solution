"use client";

import { FilterChipRow, type FilterChip } from "./FilterChipRow";
import { PropertyPicker } from "./PropertyPicker";
import {
  candidateProperties,
  selectProperty,
  selectRegion,
  selectResort,
  visibleAxes,
  visibleRegions,
  type PlaceSelection,
} from "./place-selection";
import type { ResortCatalogEntry } from "./types";
import type { ResortSlug } from "@/generated/prisma/enums";

export interface PlaceCounts {
  byProperty: Record<string, number>;
  byRegion: Record<string, number>;
  byResort: Partial<Record<ResortSlug, number>>;
}

/**
 * 장소 필터 — 리조트 / 지역 / 지점 세 축.
 *
 * 축은 전부 그리지 않는다. `visibleAxes`가 "이 축이 실제로 목록을 분할하는가"를
 * 보고 켠다 (`place-selection.ts` 참조). 롯데 단독이면 지점 칩 한 줄만 남아
 * 리팩터링 전 화면과 같아지고, Phase F로 리조트가 늘면 위 축들이 저절로 나타난다.
 */
export function PlaceFilter({
  catalog,
  value,
  counts,
  onChange,
}: {
  catalog: ResortCatalogEntry[];
  value: PlaceSelection;
  /** 조회 전에는 undefined — 배지를 그리지 않는다. */
  counts?: PlaceCounts;
  onChange: (next: PlaceSelection) => void;
}) {
  const axes = visibleAxes(catalog);
  const regions = visibleRegions(value, catalog);
  const candidates = candidateProperties(value, catalog);

  const resortChips: FilterChip[] = [
    {
      value: null,
      label: "전체",
      count: counts
        ? Object.values(counts.byResort).reduce<number>((a, b) => a + (b ?? 0), 0)
        : undefined,
    },
    ...catalog.map((entry) => ({
      value: entry.slug as string,
      label: entry.name,
      count: counts ? (counts.byResort[entry.slug] ?? 0) : undefined,
    })),
  ];

  const regionChips: FilterChip[] = [
    { value: null, label: "전체" },
    ...regions.map((region) => ({
      value: region,
      label: region,
      count: counts ? (counts.byRegion[region] ?? 0) : undefined,
    })),
  ];

  return (
    // 제목이 붙은 뒤로는 `space-y-2`(8px)가 제목을 **위 덩이에 붙여** 보이게 한다 —
    // 축과 축 사이가 축 안의 제목-칩 간격(4px)과 구별돼야 한다.
    <div className="space-y-3">
      {axes.resort && (
        <FilterChipRow
          label="리조트"
          chips={resortChips}
          value={value.resort}
          onChange={(next) =>
            onChange(selectResort(value, next as ResortSlug | null, catalog))
          }
        />
      )}

      {axes.region && (
        <FilterChipRow
          label="지역"
          layout="wrap"
          chips={regionChips}
          value={value.region}
          onChange={(next) => onChange(selectRegion(value, next, catalog))}
        />
      )}

      <PropertyPicker
        candidates={candidates}
        value={value.property}
        counts={counts?.byProperty}
        showRegion={axes.region}
        onChange={(next) => onChange(selectProperty(value, next, catalog))}
      />
    </div>
  );
}
