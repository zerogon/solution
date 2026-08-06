"use client";

import { useMemo, useState } from "react";
import { Building2, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NavBadge } from "@/components/nav-badge";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { FilterChipRow, type FilterChip } from "./FilterChipRow";
import type { PropertyRef } from "./place-selection";

/**
 * 이 수를 넘으면 칩 그리드 대신 검색 가능한 시트로 넘어간다. 320px 필터 패널에
 * 2열로 들어가는 한계이자, 눈으로 훑어서 찾을 수 있는 한계이기도 하다.
 * (롯데 단독은 4곳이라 칩, 한화·소노가 붙으면 시트.)
 */
const INLINE_MAX = 8;

/**
 * 지점 선택 축. 후보 수에 따라 두 가지 표현을 쓴다.
 *
 * 지역 축이 이미 화면에 있으면 칩의 지역 보조 줄을 생략한다 — 같은 정보가 바로
 * 위에 있는데 칩마다 반복하면 칩이 세로로 두꺼워지기만 한다.
 */
export function PropertyPicker({
  candidates,
  value,
  counts,
  showRegion,
  onChange,
}: {
  candidates: PropertyRef[];
  value: string | null;
  /** branchName → 예약 가능 건수. 조회 전에는 undefined. */
  counts?: Record<string, number>;
  showRegion: boolean;
  onChange: (next: string | null) => void;
}) {
  if (candidates.length <= INLINE_MAX) {
    const chips: FilterChip[] = [
      { value: null, label: "전체", count: totalCount(counts, candidates) },
      ...candidates.map((p) => ({
        value: p.branchName,
        label: p.label,
        sub: showRegion ? null : p.region,
        count: counts?.[p.branchName] ?? (counts ? 0 : undefined),
      })),
    ];
    return (
      <FilterChipRow label="지점" chips={chips} value={value} onChange={onChange} />
    );
  }

  return (
    <PropertySheet
      candidates={candidates}
      value={value}
      counts={counts}
      onChange={onChange}
    />
  );
}

function totalCount(
  counts: Record<string, number> | undefined,
  candidates: PropertyRef[],
): number | undefined {
  if (!counts) return undefined;
  return candidates.reduce((sum, p) => sum + (counts[p.branchName] ?? 0), 0);
}

function PropertySheet({
  candidates,
  value,
  counts,
  onChange,
}: {
  candidates: PropertyRef[];
  value: string | null;
  counts?: Record<string, number>;
  onChange: (next: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = candidates.find((p) => p.branchName === value) ?? null;

  /** 리조트별 그룹. 검색어는 지점명·지역·리조트명 어디에 걸려도 통과시킨다. */
  const groups = useMemo(() => {
    const q = query.trim();
    const hit = (p: PropertyRef) =>
      !q ||
      p.label.includes(q) ||
      p.branchName.includes(q) ||
      p.region.includes(q) ||
      p.resortName.includes(q);

    const byResort = new Map<string, PropertyRef[]>();
    for (const p of candidates.filter(hit)) {
      const bucket = byResort.get(p.resortName);
      if (bucket) bucket.push(p);
      else byResort.set(p.resortName, [p]);
    }
    return [...byResort.entries()];
  }, [candidates, query]);

  function pick(next: string | null) {
    onChange(next);
    setOpen(false);
    setQuery("");
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <SheetTrigger
        render={<Button variant="outline" className="w-full justify-start" />}
      >
        <Building2 className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left">
          {selected ? `${selected.resortName} · ${selected.label}` : "전체 지점"}
        </span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {candidates.length}
        </span>
      </SheetTrigger>

      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>지점 선택</SheetTitle>
        </SheetHeader>

        <div className="space-y-3 px-4 pb-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="지점 · 지역 · 리조트 이름으로 찾기"
            aria-label="지점 검색"
          />

          <button
            type="button"
            onClick={() => pick(null)}
            className={cn(
              "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
              value === null
                ? "border-primary bg-primary/5 font-medium ring-1 ring-primary"
                : "border-border hover:bg-muted",
            )}
          >
            전체 지점
          </button>

          {groups.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              일치하는 지점이 없습니다.
            </p>
          )}

          {groups.map(([resortName, items]) => (
            <div key={resortName} className="space-y-1.5">
              <p className="px-0.5 text-xs font-medium text-muted-foreground">
                {resortName}
              </p>
              <ul className="space-y-1">
                {items.map((p) => (
                  <li key={p.branchName}>
                    <SheetClose
                      render={
                        <button
                          type="button"
                          onClick={() => pick(p.branchName)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                            p.branchName === value
                              ? "border-primary bg-primary/5 font-medium ring-1 ring-primary"
                              : "border-border hover:bg-muted",
                          )}
                        />
                      }
                    >
                      <span className="min-w-0 flex-1 truncate">{p.label}</span>
                      <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                        <MapPin className="size-3" />
                        {p.region}
                      </span>
                      {counts && <NavBadge count={counts[p.branchName] ?? 0} />}
                    </SheetClose>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
