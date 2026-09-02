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
import { indexRates, withManualRates, type ManualRate } from "./manual-rates";
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

/**
 * 운영자가 손으로 넣은 1박 단가 전부.
 *
 * 조회 조건이 인자가 아니다 — 단가는 (지점, 객실유형)의 속성이라 날짜 축이 없다.
 * 그래서 쿼리 키가 상수이고, 조회를 다시 눌러도 이 요청은 다시 나가지 않는다.
 */
async function fetchRoomRates(): Promise<ManualRate[]> {
  const res = await fetch("/api/room-rates");
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body.rates as ManualRate[];
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

  /**
   * 수동 요금 표. 재고와 별도 쿼리인 이유는 서비스워커다 — `/api/inventory`만 SWR로
   * 캐시되는데 요금을 거기 실으면 방금 저장한 값이 캐시본에 가린다(`api/room-rates` 주석).
   *
   * ⚠️ `enabled` 게이트를 지우지 말 것. 쿼리 키가 상수라 게이트가 없으면 조회를 누르지
   * 않은 세션에도 요청이 하나 붙는다 — 마감일 계산기가 같은 실수를 한 번 했다.
   *
   * `staleTime`이 프로바이더 기본(30초)이 아니라 5분인 이유: 수동 단가는 사람이 가끔
   * 고치는 값이라 30초마다 다시 물을 근거가 없다. 저장 직후의 반영은 시간이 아니라
   * `invalidateQueries`가 책임진다.
   */
  const { data: rates } = useQuery({
    queryKey: ["room-rates"],
    queryFn: fetchRoomRates,
    enabled: committed != null,
    staleTime: 5 * 60_000,
  });

  // 화면의 조건과 실제 조회된 조건이 어긋나면 결과를 흐리게 해서 알린다.
  // 지역·지점은 클라이언트에서 즉시 좁혀지므로 어긋날 수가 없어 비교 대상이 아니다.
  const stale =
    committed != null &&
    (committed.checkin !== checkin ||
      committed.checkout !== checkout ||
      committed.resort !== place.resort);

  /**
   * 축별 예약 가능 건수 — 필터 칩 배지용. 한 번의 순회로 세 축을 다 센다.
   *
   * `row.available`이 아니라 `toneOf`로 센다. 이 배지는 "여기 눌러 볼 만하다"는 신호라
   * 확인되지 않은 행을 넣으면 사용자를 13일 된 데이터로 안내하게 된다.
   * (위 `stale`과 헷갈리지 말 것 — 저건 폼과 결과가 어긋났다는 뜻이고 데이터 나이와 무관하다.)
   */
  const counts = useMemo<PlaceCounts | undefined>(() => {
    if (!rows) return undefined;
    const acc: PlaceCounts = { byProperty: {}, byRegion: {}, byResort: {} };
    for (const row of rows) {
      const tone = toneOf(row, dataUpdatedAt);
      if (tone !== "available" && tone !== "closingSoon") continue;
      acc.byProperty[row.branchName] = (acc.byProperty[row.branchName] ?? 0) + 1;
      acc.byRegion[row.region] = (acc.byRegion[row.region] ?? 0) + 1;
      acc.byResort[row.resortSlug] = (acc.byResort[row.resortSlug] ?? 0) + 1;
    }
    return acc;
  }, [rows, dataUpdatedAt]);

  /** 지역·지점 축은 서버에 보내지 않고 여기서 좁힌다. */
  const visibleRows = useMemo(
    () => rows?.filter((row) => matchesPlace(row, place)),
    [rows, place],
  );

  /** 편집 폼이 읽는 원본. 병합된 `row.price`는 총액이라 단가를 되돌릴 수 없다. */
  const rateIndex = useMemo(() => indexRates(rates ?? []), [rates]);

  /**
   * 자동 요금이 없는 행에 수동 단가를 얹는다.
   *
   * 자리가 중요하다 — `matchesPlace` **뒤**(안 보이는 행까지 곱할 이유가 없다),
   * `groupByBranch` **앞**(섹션이 이미 요금을 그리고 헤더 라벨을 집합으로 구한다).
   * 그리고 `useMemo`여야 한다: 매 렌더 새 배열이면 아래 `counts` memo가 통째로
   * 무효화되고, 거기에 필터 칩의 예약 가능 건수가 걸려 있다.
   *
   * 박수는 화면 상태(`nights`)가 아니라 **실제로 조회된 조건**에서 온다 — 사용자가
   * 박수를 바꾸고 아직 조회를 누르지 않았을 때 둘이 갈리고, 그러면 요금이 다른 숙박의
   * 것으로 계산된다(`Results`의 `committedNights`와 같은 값이어야 한다).
   */
  const pricedRows = useMemo(() => {
    if (!visibleRows || committed == null) return visibleRows;
    return withManualRates(
      visibleRows,
      rateIndex,
      diffDaysIso(committed.checkin, committed.checkout),
    );
  }, [visibleRows, rateIndex, committed]);

  /** 캘린더와 박수 스테퍼가 공유하는 단일 진입점 — 둘 다 같은 (checkin, nights)를 쓴다. */
  function onRangeChange(next: { checkin: string; nights: number }) {
    setCheckin(next.checkin);
    setNights(next.nights);
  }

  function onSearch() {
    setCommitted({ checkin, checkout, resort: place.resort });
  }

  /**
   * 수동 요금 저장·삭제 후. 재고는 건드리지 않는다 — 요금은 `resort_inventory`가 아니라
   * 옆의 대장(`resort_room_rates`)에 있고, 그래서 무효화할 것도 그 쿼리 하나뿐이다.
   * 서버 액션의 `revalidatePath`는 관리 화면용이고 여기에는 아무 영향이 없다.
   */
  function onRateSaved() {
    queryClient.invalidateQueries({ queryKey: ["room-rates"] });
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
          rows={pricedRows}
          rates={rateIndex}
          onRateSaved={onRateSaved}
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
  rates,
  onRateSaved,
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
  /** 편집 폼이 읽는 수동 요금 원본(단가). 행에 실린 것은 총액이라 여기서 되돌릴 수 없다. */
  rates: Map<string, ManualRate>;
  onRateSaved: () => void;
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
            <BranchResultSection
              rows={group}
              now={now}
              nights={committedNights}
              rates={rates}
              onRateSaved={onRateSaved}
            />
          </Fragment>
        );
      })}
    </div>
  );
}
