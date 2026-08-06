"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarSearch, RefreshCw, Search, SearchX, TriangleAlert } from "lucide-react";

import { addDaysIso, todayKstIso } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { DateRangeField } from "./DateRangeField";
import { NightsStepper } from "./NightsStepper";
import { PlaceFilter, type PlaceCounts } from "./PlaceFilter";
import { AvailabilitySummary } from "./AvailabilitySummary";
import { BranchResultSection } from "./BranchResultSection";
import { ResultSkeleton } from "./ResultSkeleton";
import {
  ALL_PLACES,
  matchesPlace,
  refreshTarget,
  type PlaceSelection,
} from "./place-selection";
import type { Committed, InventoryRow, ResortCatalogEntry } from "./types";

/**
 * 빈 파라미터는 아예 보내지 않는다 — 서비스워커의 캐시 키는 URL이라 `resort=`와
 * 파라미터 부재가 서로 다른 항목이 된다.
 */
async function fetchInventory(
  c: Committed,
  opts: { fresh?: boolean } = {},
): Promise<InventoryRow[]> {
  const qs = new URLSearchParams({ checkin: c.checkin, checkout: c.checkout });
  if (c.resort) qs.set("resort", c.resort);
  const res = await fetch(`/api/inventory?${qs.toString()}`, {
    // 최신화 직후에는 SW의 stale-while-revalidate를 건너뛰어야 한다 — 캐시본을 먼저
    // 돌려주면 방금 크롤한 결과가 한 박자 늦게 보인다 (public/sw.js).
    headers: opts.fresh ? { "x-fresh": "1" } : undefined,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body.rows as InventoryRow[];
}

/** 행들을 지점별로 묶는다. `/api/inventory`가 이미 region→resort→branch 순으로 정렬해 준다. */
function groupByBranch(rows: InventoryRow[]): InventoryRow[][] {
  const groups = new Map<string, InventoryRow[]>();
  for (const row of rows) {
    const bucket = groups.get(row.branchName);
    if (bucket) bucket.push(row);
    else groups.set(row.branchName, [row]);
  }
  return [...groups.values()];
}

export function SearchView({ catalog }: { catalog: ResortCatalogEntry[] }) {
  const today = useMemo(() => todayKstIso(), []);
  const [checkin, setCheckin] = useState(today);
  const [nights, setNights] = useState(1);
  const [place, setPlace] = useState<PlaceSelection>(ALL_PLACES);
  const [committed, setCommitted] = useState<Committed | null>(null);

  const queryClient = useQueryClient();
  const [refreshing, startRefresh] = useTransition();

  const checkout = addDaysIso(checkin, nights);
  const target = refreshTarget(place, catalog);

  const {
    data: rows,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ["inventory", committed],
    queryFn: () => fetchInventory(committed as Committed),
    enabled: committed != null,
  });

  // 화면의 조건과 실제 조회된 조건이 어긋나면 결과를 흐리게 해서 알린다.
  // 지역·지점은 클라이언트에서 즉시 좁혀지므로 어긋날 수가 없어 비교 대상이 아니다.
  const stale =
    committed != null &&
    (committed.checkin !== checkin ||
      committed.checkout !== checkout ||
      committed.resort !== place.resort);

  /** 축별 예약 가능 건수 — 필터 칩 배지용. 한 번의 순회로 세 축을 다 센다. */
  const counts = useMemo<PlaceCounts | undefined>(() => {
    if (!rows) return undefined;
    const acc: PlaceCounts = { byProperty: {}, byRegion: {}, byResort: {} };
    for (const row of rows) {
      if (!row.available) continue;
      acc.byProperty[row.branchName] = (acc.byProperty[row.branchName] ?? 0) + 1;
      acc.byRegion[row.region] = (acc.byRegion[row.region] ?? 0) + 1;
      acc.byResort[row.resortSlug] = (acc.byResort[row.resortSlug] ?? 0) + 1;
    }
    return acc;
  }, [rows]);

  /** 지역·지점 축은 서버에 보내지 않고 여기서 좁힌다. */
  const visibleRows = useMemo(
    () => rows?.filter((row) => matchesPlace(row, place)),
    [rows, place],
  );

  /** 캘린더와 박수 스테퍼가 공유하는 단일 진입점 — 둘 다 같은 (checkin, nights)를 쓴다. */
  function onRangeChange(next: { checkin: string; nights: number }) {
    setCheckin(next.checkin);
    setNights(next.nights);
  }

  function onSearch() {
    setCommitted({ checkin, checkout, resort: place.resort });
  }

  function onRefresh() {
    if (!target) {
      toast.error("최신화할 지점을 선택하세요 (전체·지역 조회는 캐시만 지원)");
      return;
    }
    startRefresh(async () => {
      const start = Date.now();
      try {
        const res = await fetch(
          `/api/resorts/${target.slug.toLowerCase()}/refresh`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              checkin,
              checkout,
              branch: target.branchName,
            }),
          },
        );
        const body = await res.json();
        const elapsed = Math.round((Date.now() - start) / 100) / 10;
        if (!res.ok) {
          toast.error(
            `최신화 실패 (${elapsed}s): ${body?.message ?? body?.error ?? `HTTP ${res.status}`}`,
          );
          return;
        }
        if (body.status === "SUCCESS") {
          toast.success(`최신화 완료 (${elapsed}s · ${body.rowsUpserted ?? 0}건)`);
        } else {
          toast.error(
            `크롤링 실패 (${body.errorStage ?? "?"}): ${body.errorMessage ?? "원인 미상"}`,
          );
        }
        // invalidate가 아니라 직접 채운다 — 왕복이 한 번으로 줄고, `fresh`로 SW의
        // 캐시본을 건너뛰므로 방금 크롤한 결과가 곧바로 보인다.
        const next: Committed = { checkin, checkout, resort: place.resort };
        const fresh = await fetchInventory(next, { fresh: true });
        queryClient.setQueryData(["inventory", next], fresh);
        setCommitted(next);
      } catch (e) {
        toast.error(`호출 오류: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  return (
    // minmax(0,1fr): 결과 컬럼이 콘텐츠보다 작아질 수 있어야 객실명 truncate가 동작한다.
    <div
      className="grid gap-6 xl:grid-cols-[20rem_minmax(0,1fr)] 2xl:grid-cols-[22rem_minmax(0,1fr)]"
      {...(stale ? { "data-range-pending": "" } : {})}
    >
      {/* xl:self-start 필수 — 늘어난 그리드 아이템은 움직일 여지가 없어 sticky가 무효가 된다.
          top-8은 <main>의 md:py-8과 맞춘 값(데스크톱엔 sticky 헤더가 없다). */}
      <aside className="space-y-3 xl:sticky xl:top-8 xl:self-start">
        <DateRangeField
          checkin={checkin}
          nights={nights}
          today={today}
          onChange={onRangeChange}
          onSearch={onSearch}
        />

        <NightsStepper
          checkin={checkin}
          nights={nights}
          onChange={(next) => onRangeChange({ checkin, nights: next })}
        />

        <PlaceFilter
          catalog={catalog}
          value={place}
          counts={counts}
          onChange={setPlace}
        />

        {!target && (
          <p className="px-0.5 text-xs text-muted-foreground">
            전체·지역 조회는 캐시만 가능합니다. 라이브 최신화는 지점을 선택하세요.
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button onClick={onSearch} disabled={isFetching} className="flex-1">
            <Search className="size-4" />
            {isFetching ? "조회 중…" : "조회"}
          </Button>
          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={refreshing || !target}
            title={
              !target ? "지점을 선택하면 라이브 최신화가 가능합니다" : undefined
            }
            className="min-w-0 flex-1"
          >
            <RefreshCw
              className={refreshing ? "size-4 shrink-0 animate-spin" : "size-4 shrink-0"}
            />
            <span className="min-w-0 truncate">
              {refreshing
                ? "최신화 중…"
                : target
                  ? `최신화 · ${target.label}`
                  : "최신화"}
            </span>
          </Button>
        </div>
      </aside>

      <div data-range-dim className="min-w-0">
        <Results
          committed={committed}
          place={place}
          catalog={catalog}
          rows={visibleRows}
          hasTarget={target != null}
          isFetching={isFetching}
          isError={isError}
          error={error}
        />
      </div>
    </div>
  );
}

function Results({
  committed,
  place,
  catalog,
  rows,
  hasTarget,
  isFetching,
  isError,
  error,
}: {
  committed: Committed | null;
  place: PlaceSelection;
  catalog: ResortCatalogEntry[];
  rows: InventoryRow[] | undefined;
  hasTarget: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
}) {
  if (committed == null) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={CalendarSearch}
            title="조회할 준비가 됐습니다"
            description="날짜와 지점을 고른 뒤 ‘조회’를 누르면 수집된 객실을 보여줍니다."
          />
        </CardContent>
      </Card>
    );
  }

  if (isFetching && !rows) return <ResultSkeleton />;

  if (isError) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={TriangleAlert}
            title="조회 중 오류가 발생했습니다"
            description={error instanceof Error ? error.message : String(error)}
          />
        </CardContent>
      </Card>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={SearchX}
            title="수집된 데이터가 없습니다"
            description={
              hasTarget
                ? "이 날짜로 수집된 기록이 아직 없습니다. ‘최신화’를 눌러 실시간으로 가져오세요."
                : "이 조건으로 수집된 기록이 아직 없습니다. 지점을 선택하면 실시간 최신화가 가능합니다."
            }
          />
        </CardContent>
      </Card>
    );
  }

  const groups = groupByBranch(rows);

  // 지역을 좁히지 않은 상태에서 결과가 여러 지역에 걸쳐 있을 때만 구분선을 넣는다.
  // 행이 이미 region 우선으로 정렬돼 오므로 값이 바뀌는 지점만 보면 된다.
  const showRegionDividers =
    place.region === null && new Set(rows.map((r) => r.region)).size >= 2;

  return (
    <div className="space-y-6">
      <AvailabilitySummary
        rows={rows}
        committed={committed}
        place={place}
        catalog={catalog}
      />
      {groups.map((group, i) => {
        const region = group[0].region;
        const newRegion = i === 0 || groups[i - 1][0].region !== region;
        return (
          <Fragment key={group[0].branchName}>
            {showRegionDividers && newRegion && (
              <h3 className="flex items-center gap-3 px-0.5 pt-2 text-xs font-medium text-muted-foreground">
                {region}
                <span className="h-px flex-1 bg-border" aria-hidden />
              </h3>
            )}
            <BranchResultSection rows={group} />
          </Fragment>
        );
      })}
    </div>
  );
}
