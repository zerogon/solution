"use client";

import { useMemo, useState } from "react";
import { Check, ChevronRight, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { FilterChipRow, FilterCount, type FilterChip } from "./FilterChipRow";
import {
  allProperties,
  browseRegion,
  browseResort,
  candidateProperties,
  compareRegions,
  placeLabel,
  scopeLabel,
  selectProperty,
  visibleAxes,
  visibleRegions,
  type PlaceCounts,
  type PlaceSelection,
  type PropertyRef,
} from "./place-selection";
import type { ResortCatalogEntry } from "./types";

/**
 * 이 수 이하면 리조트 그룹을 전부 펼쳐 둔다. 접기는 훑을 것이 많을 때의 장치이고,
 * 여덟 줄짜리 목록에서는 클릭을 한 번 더 요구하는 것에 지나지 않는다
 * (롯데 단독 카탈로그가 4곳이다).
 */
const AUTO_EXPAND_MAX = 8;

/**
 * 장소 선택 팝업의 **본문**. 데스크톱 팝오버와 모바일 시트가 이것 하나를 공유한다
 * (`PlaceField`가 껍데기를 고른다). 열림 상태를 모르는 것이 이 컴포넌트의 계약이다.
 *
 * ## 규칙은 셋이다
 * - **지역 칩 = 좁히기.** 즉시 적용되고 팝업은 **열린 채**로 목록이 줄어든다.
 * - **리조트 그룹 헤더 = 펼치기.** 선택을 바꾸지 않는다(뒤의 결과가 그대로다).
 * - **행 = 확정.** 누르면 호출부가 팝업을 닫는다. 맨 위 범위 행, 각 그룹의
 *   `{리조트} 전체` 행, 지점 행 셋 다 같다.
 *
 * 취소라는 개념이 없다는 점이 이 설계를 안전하게 만든다 — 선택은 이미 적용돼 있으므로
 * **어느 경로로 닫아도 결과가 같다.**
 *
 * ## 리조트는 칩이 아니라 그룹이 맡는다
 * 종전에는 리조트 칩 줄이 따로 있었는데, 그룹을 접게 되면서 같은 이름 다섯 개를 화면이
 * 두 번 말하게 됐다. 칩 줄을 지우고 그 역할을 그룹에 넘겼다 —
 * **헤더가 펼치기, 그 안 첫 행(`{리조트} 전체`)이 선택.**
 *
 * ⚠️ 그래서 **맨 위 범위 행은 리조트 축을 뺀 범위를 가리킨다**(`widened`). 종전처럼
 * `scopeLabel(value)`를 그대로 쓰면 리조트를 고른 순간 이 행이 "한화리조트 전체"가 되어
 * **모든 리조트로 되돌아가는 문이 사라진다** — 그 일을 하던 것이 방금 지운 칩이었다.
 * 지금 위계는 `전체 지점 → {리조트} 전체 → {지점}` 세 단계다.
 *
 * ## 검색은 카탈로그 전체를 본다
 * 칩으로 좁힌 범위가 아니다. 이름을 쳐서 찾는 사람에게 "지금 지역 칩이 제주라서
 * 안 나옵니다"는 침묵이고, 증상이 "필터를 눌렀는데 0건"과 구별되지 않는다.
 * 고르는 순간 `selectProperty`가 상위 축을 그 지점 값으로 덮으므로 모순도 안 생긴다.
 */
export function PlacePicker({
  catalog,
  value,
  counts,
  onChange,
  onPick,
  autoFocusSearch = false,
}: {
  catalog: ResortCatalogEntry[];
  value: PlaceSelection;
  /** 조회 전에는 undefined — 숫자를 그리지 않는다. */
  counts?: PlaceCounts;
  /** 축 좁히기. 팝업을 닫지 않는다. */
  onChange: (next: PlaceSelection) => void;
  /** 확정. 호출부가 이걸 받아 팝업을 닫는다. */
  onPick: (next: PlaceSelection) => void;
  /**
   * 열자마자 검색창에 포커스. **데스크톱 팝오버에서만 켠다** — 모바일 바텀 시트에서
   * 켜면 소프트 키보드가 시트를 덮어, 사용자가 처음 보는 것이 칩도 목록도 아닌
   * 자기 키보드가 된다. 껍데기가 이미 둘로 갈려 있으므로 미디어쿼리 훅 없이 분기된다.
   */
  autoFocusSearch?: boolean;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim();
  const searching = q !== "";

  const axes = visibleAxes(value, catalog);
  const regions = visibleRegions(value, catalog);
  const scoped = candidateProperties(value, catalog);

  /** 맨 위 범위 행이 가리키는 곳 — 지금 지역 안의 **모든** 리조트. */
  const widened: PlaceSelection = {
    resort: null,
    region: value.region,
    property: null,
  };
  const widenedCount = candidateProperties(widened, catalog).length;

  const listed = useMemo(() => {
    if (!searching) return scoped;
    return allProperties(catalog).filter(
      (p) =>
        p.label.includes(q) ||
        p.branchName.includes(q) ||
        p.region.includes(q) ||
        p.resortName.includes(q),
    );
  }, [catalog, scoped, searching, q]);

  /** 리조트별 그룹. 입력 순서를 보존하므로 카탈로그 정렬이 그대로 유지된다. */
  const groups = useMemo(() => {
    const byResort = new Map<string, PropertyRef[]>();
    for (const p of listed) {
      const bucket = byResort.get(p.resortName);
      if (bucket) bucket.push(p);
      else byResort.set(p.resortName, [p]);
    }
    return [...byResort.entries()];
  }, [listed]);

  /**
   * 펼침 상태. 기본값은 아래 규칙에서 **파생**하고 사용자의 토글이 그것을 이긴다.
   *
   * 좁힘이 바뀌면 파생 기본값이 다시 적용돼야 하는데(리조트를 고른 뒤에도 예전 토글이
   * 남아 있으면 안 된다) effect로 리셋하지 않는다 — 이 저장소는 effect 안의 setState를
   * lint로 막는다. 대신 상태에 좁힘 키를 같이 넣고 렌더 시점에 비교한다.
   */
  const scopeKey = `${value.resort ?? ""}|${value.region ?? ""}|${searching}`;
  const [manual, setManual] = useState<{
    key: string;
    map: Record<string, boolean>;
  }>({ key: scopeKey, map: {} });
  const map = manual.key === scopeKey ? manual.map : {};

  function defaultOpen(items: PropertyRef[]): boolean {
    if (searching) return true; // 접힌 검색 결과는 "없다"로 읽힌다
    if (groups.length === 1) return true;
    if (value.resort !== null && items[0].slug === value.resort) return true;
    if (
      value.property !== null &&
      items.some((p) => p.branchName === value.property)
    ) {
      return true; // 지금 어디 있는지 보이고, 형제 지점으로 갈아타기가 한 번에 된다
    }
    return listed.length <= AUTO_EXPAND_MAX;
  }

  /**
   * **검색 중에는 목록에 건수를 그리지 않는다.**
   *
   * `counts`는 현재 좁힘(리조트·지역)을 전제로 센 패싯 값인데 검색은 일부러 그 밖을
   * 본다 — 강원만 보는 중에 "제주"를 검색하면 매치들의 건수가 전부 0으로 나와,
   * 실제로는 자리가 있는 지점이 없는 것처럼 읽힌다. 좁힘 밖의 것 옆에 좁힘 기준
   * 숫자를 놓으면 그건 정보가 아니라 거짓말이다. 칩과 범위 행이 검색 중에 숨는 것과
   * 같은 이유다.
   */
  const listCounts = searching ? undefined : counts;

  // 각 축의 "전체" 칩은 **그 축의 합**이다. 패싯 카운트라 축마다 분모가 다르다 —
  // 지역 축의 합은 "현재 리조트 안의 전부"다.
  const regionChips: FilterChip[] = [
    { value: null, label: "전체", count: sum(counts?.byRegion) },
    ...regions.map((region) => ({
      value: region,
      label: region,
      count: counts ? (counts.byRegion[region] ?? 0) : undefined,
    })),
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* 현재 선택. 모바일 시트는 패널을 덮으므로, 칩을 눌렀을 때의 피드백이
          시트 밖에만 있으면 보이지 않는다. 이 줄이 "이미 적용됐다"를 말한다. */}
      <div className="flex items-center gap-1.5 px-0.5">
        <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {placeLabel(value, catalog)}
        </span>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          // 본문을 <form>으로 감싸지 않으므로 여기서만 Enter를 해석한다.
          e.preventDefault();
          if (listed.length === 1) {
            onPick(selectProperty(value, listed[0].branchName, catalog));
          }
        }}
        autoFocus={autoFocusSearch}
        placeholder="지점 · 지역 · 리조트 이름으로 찾기"
        aria-label="지점 검색"
      />

      {/* 검색 중에는 칩을 감춘다. 검색은 칩보다 상위의 좁히기 수단이고, 둘을 같이
          띄우면 예전 패널의 난잡함을 팝업 안으로 옮기는 것에 지나지 않는다. */}
      {!searching && axes.region && (
        <FilterChipRow
          label="지역"
          chips={regionChips}
          value={value.region}
          onChange={(next) => onChange(browseRegion(value, next, catalog))}
        />
      )}

      {/* 이 선이 실제로 일을 한다 — 위는 좁히기, 아래는 확정. */}
      <div className="max-h-[46vh] space-y-2 overflow-y-auto border-t pt-3">
        {!searching && (
          <Row
            selected={value.resort === null && value.property === null}
            onClick={() => onPick(widened)}
          >
            <span className="min-w-0 flex-1 truncate font-medium">
              {scopeLabel(widened, catalog)}
            </span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
              {widenedCount}곳
            </span>
          </Row>
        )}

        {groups.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            일치하는 지점이 없습니다.
          </p>
        )}

        {groups.map(([resortName, items]) => (
          <ResortGroup
            key={resortName}
            resortName={resortName}
            items={items}
            catalog={catalog}
            value={value}
            counts={listCounts}
            showShell={axes.resort}
            searching={searching}
            open={map[resortName] ?? defaultOpen(items)}
            onToggle={() =>
              setManual({
                key: scopeKey,
                map: {
                  ...map,
                  [resortName]: !(map[resortName] ?? defaultOpen(items)),
                },
              })
            }
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 리조트 하나의 접히는 묶음.
 *
 * `showShell`이 false면(카탈로그에 리조트가 한 곳뿐) 헤더도 `{리조트} 전체` 행도 그리지
 * 않고 지점만 남긴다 — 그때 헤더는 정보가 0이고 `{리조트} 전체`는 맨 위 범위 행과 같은
 * 말이다. `visibleAxes(...).resort`가 이 판정을 준다.
 */
function ResortGroup({
  resortName,
  items,
  catalog,
  value,
  counts,
  showShell,
  searching,
  open,
  onToggle,
  onPick,
}: {
  resortName: string;
  items: PropertyRef[];
  catalog: ResortCatalogEntry[];
  value: PlaceSelection;
  counts?: PlaceCounts;
  showShell: boolean;
  searching: boolean;
  open: boolean;
  onToggle: () => void;
  onPick: (next: PlaceSelection) => void;
}) {
  const slug = items[0].slug;
  const listId = `place-group-${slug}`;

  /** 그룹 안의 지역 소그룹. 지역이 하나뿐이면 소제목은 소음이라 그리지 않는다. */
  const sections = useMemo(() => {
    const byRegion = new Map<string, PropertyRef[]>();
    for (const p of items) {
      const bucket = byRegion.get(p.region);
      if (bucket) bucket.push(p);
      else byRegion.set(p.region, [p]);
    }
    return [...byRegion.entries()].sort((a, b) => compareRegions(a[0], b[0]));
  }, [items]);
  const showRegionHeads = sections.length >= 2;

  const body = (
    <div id={listId} className={cn("space-y-1", showShell && "pt-1 pl-2")}>
      {/* 검색 중에는 이 행을 그리지 않는다. `{n}곳`은 **매치 수**인데 이 행의 동작은
          그 리조트 **전체** 선택이라, 검색 결과 위에 놓이면 숫자와 동작이 어긋난다
          ("소노호텔앤리조트 전체 5곳"을 눌렀는데 32곳이 선택된다). 맨 위 범위 행이
          검색 중에 숨는 것과 같은 이유. */}
      {showShell && !searching && (
        <Row
          selected={value.resort === slug && value.property === null}
          onClick={() => onPick(browseResort(value, slug, catalog))}
        >
          <span className="min-w-0 flex-1 truncate font-medium">
            {resortName} 전체
          </span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            {items.length}곳
          </span>
        </Row>
      )}

      {sections.map(([region, rows]) => (
        <div key={region} className="space-y-1">
          {showRegionHeads && (
            <p className="px-1 pt-1 text-[11px] font-medium text-muted-foreground">
              {region}
            </p>
          )}
          <ul className="space-y-1">
            {rows.map((p) => (
              <li key={p.branchName}>
                <Row
                  selected={p.branchName === value.property}
                  onClick={() =>
                    onPick(selectProperty(value, p.branchName, catalog))
                  }
                >
                  {p.branchName === value.property && (
                    <Check className="size-3.5 shrink-0 text-primary" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{p.label}</span>
                  {/* 바로 위 소제목이 같은 말을 하고 있으면 반복하지 않는다. */}
                  {!showRegionHeads && (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {p.region}
                    </span>
                  )}
                  <FilterCount
                    count={
                      counts ? (counts.byProperty[p.branchName] ?? 0) : undefined
                    }
                  />
                </Row>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );

  if (!showShell) return body;

  return (
    <div>
      {/* 헤더는 **선택이 아니라 펼치기**다. 그래서 선택 링을 달지 않고 셰브런을 단다.
          sticky는 소노 32행을 펼쳤을 때 무엇을 보고 있는지 잃지 않기 위한 것이고,
          `bg-popover`는 팝오버·시트 둘 다의 배경이라 행이 비쳐 보이지 않는다. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={onToggle}
        className="sticky top-0 z-10 flex w-full items-center gap-2 rounded-lg bg-popover px-2 py-2 text-left transition-colors hover:bg-muted"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {resortName}
        </span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {items.length}곳
        </span>
        <FilterCount count={counts ? (counts.byResort[slug] ?? 0) : undefined} />
      </button>

      {open && body}
    </div>
  );
}

/** 목록의 한 행. 범위 행·`{리조트} 전체` 행·지점 행이 **같은 모양**이어야 규칙이 하나로 읽힌다. */
function Row({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
        selected
          ? "border-primary bg-primary/5 font-medium ring-1 ring-primary"
          : "border-border hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function sum(map: Partial<Record<string, number>> | undefined): number | undefined {
  if (!map) return undefined;
  return Object.values(map).reduce<number>((a, b) => a + (b ?? 0), 0);
}
