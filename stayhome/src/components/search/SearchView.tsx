"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarSearch, RefreshCw, Search, SearchX, TriangleAlert } from "lucide-react";

import { addDaysIso, diffDaysIso, todayKstIso } from "@/lib/utils";
import { toneOf } from "@/lib/availability-tone";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { DateRangeField } from "./DateRangeField";
import { PlaceField } from "./PlaceField";
import { AvailabilitySummary } from "./AvailabilitySummary";
import { BranchResultSection } from "./BranchResultSection";
import { ResultSkeleton } from "./ResultSkeleton";
import {
  ALL_PLACES,
  matchesPlace,
  refreshTarget,
  type PlaceCounts,
  type PlaceSelection,
} from "./place-selection";
import type { Committed, InventoryRow, ResortCatalogEntry } from "./types";

/**
 * URL을 만드는 **유일한** 자리. 조회와 최신화 직후 재조회가 같은 문자열을 만들어야
 * 서비스워커의 캐시 키(= URL)와 React Query 키가 갈리지 않는다.
 *
 * 보내는 것은 날짜뿐이다 — 장소 세 축은 전부 클라이언트가 좁힌다(`Committed` 주석).
 * 라우트는 `resort`/`branch`를 아직 받지만 그건 SW가 들고 있을 수 있는 옛 캐시 URL을
 * 위한 호환이고, 검색 UI는 더 이상 보내지 않는다.
 */
async function fetchInventory(
  c: Committed,
  opts: { fresh?: boolean } = {},
): Promise<InventoryRow[]> {
  const qs = new URLSearchParams({ checkin: c.checkin, checkout: c.checkout });
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
    // 신선도의 기준 시각. `Date.now()`를 렌더에서 부르면 리렌더마다 값이 달라져
    // 임계값 경계의 행이 깜빡이고, React 컴파일러가 순수성 위반으로 막는다.
    // 그보다 이 값이 의미상으로도 맞다 — 묻는 것은 "지금 몇 시인가"가 아니라
    // "이 행들을 받았을 때 얼마나 낡아 있었나"이다.
    dataUpdatedAt,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ["inventory", committed],
    queryFn: () => fetchInventory(committed as Committed),
    enabled: committed != null,
  });

  // 화면의 조건과 실제 조회된 조건이 어긋나면 결과를 흐리게 해서 알린다.
  // **비교 대상은 날짜뿐이다** — 장소 세 축은 클라이언트에서 즉시 좁혀지므로 어긋날
  // 수가 없다. 리조트가 여기 있던 시절에는 지역 칩과 똑같이 생긴 리조트 칩만 결과를
  // 흐리게 만들었고, 그게 이 화면에서 가장 자주 어리둥절하게 만드는 자리였다.
  const stale =
    committed != null &&
    (committed.checkin !== checkin || committed.checkout !== checkout);

  /**
   * 축별 예약 가능 건수 — 칩과 목록 행의 숫자. 한 번의 순회로 세 축을 다 센다.
   *
   * ## 각 축은 자기 자신을 빼고 센다 (패싯 카운트)
   * 리조트가 서버 축이던 시절에는 `rows`가 이미 그 리조트만 담아서 지역 배지가 저절로
   * 스코프됐다. 이제 `rows`는 **항상 전 리조트**를 담으므로 그 공짜가 사라졌고,
   * 그냥 세면 리조트=소노인 상태에서 "강원 12"라고 떠 있는 칩을 눌렀을 때 소노 강원
   * 3건만 나온다 — 이 저장소가 명시적으로 거부한 실패 모드다("칩에 건수는 떠 있는데
   * 눌러도 안 나온다"). 자기 축을 빼면 배지의 계약이 "여기 뭔가 있다"에서
   * **"이 칩을 누르면 결과가 정확히 N건이 된다"**로 강해진다.
   *
   * `place.property`는 **어느 축에도 넣지 않는다** — 넣으면 지점 하나를 고른 순간
   * 나머지 배지가 전부 0이 되어 되돌아갈 길이 안 보인다.
   *
   * ## `row.available`이 아니라 `toneOf`로 센다
   * 이 숫자는 "여기 눌러 볼 만하다"는 신호라, 확인되지 않은 행을 넣으면 사용자를
   * 13일 된 데이터로 안내하게 된다. (위 `stale`과 헷갈리지 말 것 — 저건 폼과 결과가
   * 어긋났다는 뜻이고 데이터 나이와 무관하다.)
   */
  const counts = useMemo<PlaceCounts | undefined>(() => {
    if (!rows) return undefined;
    const acc: PlaceCounts = { byProperty: {}, byRegion: {}, byResort: {} };
    for (const row of rows) {
      const tone = toneOf(row, dataUpdatedAt);
      if (tone !== "available" && tone !== "closingSoon") continue;
      const okResort = place.resort === null || row.resortSlug === place.resort;
      const okRegion = place.region === null || row.region === place.region;
      if (okRegion) {
        acc.byResort[row.resortSlug] = (acc.byResort[row.resortSlug] ?? 0) + 1;
      }
      if (okResort) {
        acc.byRegion[row.region] = (acc.byRegion[row.region] ?? 0) + 1;
      }
      if (okResort && okRegion) {
        acc.byProperty[row.branchName] =
          (acc.byProperty[row.branchName] ?? 0) + 1;
      }
    }
    return acc;
  }, [rows, dataUpdatedAt, place.resort, place.region]);

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
    setCommitted({ checkin, checkout });
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
          // 요금 건수는 0일 때 감춘다(다섯 중 리솜만 요금을 준다 — 나머지에서 "요금 0건"은
          // 실패가 아니라 그냥 해당 없음이다). 반대로 0이 아닐 때는 반드시 보여준다:
          // 요금 수집은 예산에 걸리면 조용히 일부만 붙이고 끝나는데, 그 절단이 숫자로
          // 드러나지 않으면 "요금이 없는 방"과 "못 물어본 방"이 화면에서 똑같이 빈칸이다.
          const priced = body.pricedRows ?? 0;
          toast.success(
            `최신화 완료 (${elapsed}s · ${body.rowsUpserted ?? 0}건` +
              (priced > 0 ? ` · 요금 ${priced}건` : "") +
              ")",
          );
        } else {
          toast.error(
            `크롤링 실패 (${body.errorStage ?? "?"}): ${body.errorMessage ?? "원인 미상"}`,
          );
        }
        // invalidate가 아니라 직접 채운다 — 왕복이 한 번으로 줄고, `fresh`로 SW의
        // 캐시본을 건너뛰므로 방금 크롤한 결과가 곧바로 보인다.
        const next: Committed = { checkin, checkout };
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
        {/* 장소가 맨 위인 이유 둘. (1) 발화 순서가 그렇다 — "설악 쏘라노 8/29 되나요".
            (2) 커밋 모델이 그렇다: 즉시 반영되는 축이 위에, 버튼을 기다리는 축(날짜)과
            그 버튼이 아래에 붙어 하나의 폼처럼 읽힌다. */}
        <PlaceField
          catalog={catalog}
          value={place}
          counts={counts}
          onChange={setPlace}
        />

        <DateRangeField
          checkin={checkin}
          nights={nights}
          today={today}
          onChange={onRangeChange}
          onSearch={onSearch}
        />

        <div className="flex items-center gap-2">
          {/* 조회는 글자가 짧으니 폭을 고정하고 남는 폭을 최신화에 준다 — 그쪽 라벨은
              지점 이름을 실어 나르므로 길다("최신화 · 소노벨 B·C 비발디파크"). */}
          <Button
            onClick={onSearch}
            disabled={isFetching}
            className="shrink-0 px-4"
          >
            <Search className="size-4" />
            {isFetching ? "조회 중…" : "조회"}
          </Button>
          {/* disabled 버튼은 title 이벤트를 받지 못하므로 span으로 감싼다
              (`admin/PropertyTable.tsx`와 같은 우회 — tooltip 프리미티브가 없다). */}
          <span
            className="min-w-0 flex-1"
            title={
              !target ? "지점을 선택하면 라이브 최신화가 가능합니다" : undefined
            }
          >
            <Button
              variant="outline"
              onClick={onRefresh}
              disabled={refreshing || !target}
              className="w-full min-w-0"
            >
              <RefreshCw
                className={
                  refreshing ? "size-4 shrink-0 animate-spin" : "size-4 shrink-0"
                }
              />
              {/* 상시 안내문을 없애고 버튼이 자기 선행조건을 말한다. 같은 내용을
                  결과 쪽 EmptyState가 이미 조건부로 말하고 있어서, 회색 문단 하나가
                  패널 세로를 상시로 먹을 이유가 없었다. */}
              <span className="min-w-0 truncate">
                {refreshing
                  ? "최신화 중…"
                  : target
                    ? `최신화 · ${target.label}`
                    : "지점 선택 후 최신화"}
              </span>
            </Button>
          </span>
        </div>
      </aside>

      <div data-range-dim className="min-w-0">
        <Results
          committed={committed}
          place={place}
          catalog={catalog}
          rows={visibleRows}
          now={dataUpdatedAt}
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
  now,
  hasTarget,
  isFetching,
  isError,
  error,
}: {
  committed: Committed | null;
  place: PlaceSelection;
  catalog: ResortCatalogEntry[];
  rows: InventoryRow[] | undefined;
  /** 행 신선도를 재는 기준 시각 — 이 행들을 받은 순간(React Query의 `dataUpdatedAt`). */
  now: number;
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

  // 요금은 숙박 총액으로 저장되므로 1박 환산에 박수가 필요하다. 화면 상태(`nights`)가
  // 아니라 **실제로 조회된 조건**에서 구한다 — 사용자가 박수를 바꾸고 아직 조회를
  // 누르지 않았을 때 그 둘이 갈리고, 그러면 요금이 다른 숙박의 것으로 나뉜다.
  const committedNights = diffDaysIso(committed.checkin, committed.checkout);

  // 지역을 좁히지 않은 상태에서 결과가 여러 지역에 걸쳐 있을 때만 구분선을 넣는다.
  // 행이 이미 region 우선으로 정렬돼 오므로 값이 바뀌는 지점만 보면 된다.
  const showRegionDividers =
    place.region === null && new Set(rows.map((r) => r.region)).size >= 2;

  return (
    <div className="space-y-6">
      <AvailabilitySummary
        rows={rows}
        now={now}
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
            <BranchResultSection rows={group} now={now} nights={committedNights} />
          </Fragment>
        );
      })}
    </div>
  );
}
