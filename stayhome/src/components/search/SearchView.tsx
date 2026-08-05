"use client";

import { useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarSearch, RefreshCw, Search, SearchX, TriangleAlert } from "lucide-react";

import { addDaysIso, todayKstIso } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { DateRangeField } from "./DateRangeField";
import { NightsStepper } from "./NightsStepper";
import { ALL_BRANCHES, BranchTabs } from "./BranchTabs";
import { AvailabilitySummary } from "./AvailabilitySummary";
import { BranchResultSection } from "./BranchResultSection";
import { ResultSkeleton } from "./ResultSkeleton";
import type { Committed, InventoryRow } from "./types";

async function fetchInventory(c: Committed): Promise<InventoryRow[]> {
  const qs = new URLSearchParams({ checkin: c.checkin, checkout: c.checkout });
  if (c.branch) qs.set("branch", c.branch);
  const res = await fetch(`/api/inventory?${qs.toString()}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body.rows as InventoryRow[];
}

/** 행들을 지점별로 묶는다. `/api/inventory`가 이미 region→branch 순으로 정렬해 준다. */
function groupByBranch(rows: InventoryRow[]): InventoryRow[][] {
  const groups = new Map<string, InventoryRow[]>();
  for (const row of rows) {
    const bucket = groups.get(row.branchName);
    if (bucket) bucket.push(row);
    else groups.set(row.branchName, [row]);
  }
  return [...groups.values()];
}

export function SearchView() {
  const today = useMemo(() => todayKstIso(), []);
  const [checkin, setCheckin] = useState(today);
  const [nights, setNights] = useState(1);
  const [branch, setBranch] = useState<string>(ALL_BRANCHES);
  const [committed, setCommitted] = useState<Committed | null>(null);

  const queryClient = useQueryClient();
  const [refreshing, startRefresh] = useTransition();

  const checkout = addDaysIso(checkin, nights);

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
  const stale =
    committed != null &&
    (committed.checkin !== checkin ||
      committed.checkout !== checkout ||
      committed.branch !== branch);

  /** 지점별 예약 가능 건수 — 세그먼트 배지용. */
  const availableCounts = useMemo(() => {
    if (!rows) return undefined;
    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (row.available) counts[row.branchName] = (counts[row.branchName] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  /** 캘린더와 박수 스테퍼가 공유하는 단일 진입점 — 둘 다 같은 (checkin, nights)를 쓴다. */
  function onRangeChange(next: { checkin: string; nights: number }) {
    setCheckin(next.checkin);
    setNights(next.nights);
  }

  function onSearch() {
    setCommitted({ checkin, checkout, branch });
  }

  function onRefresh() {
    if (!branch) {
      toast.error("최신화하려면 지점을 선택하세요 (전체 지점은 캐시 조회만 지원)");
      return;
    }
    startRefresh(async () => {
      const start = Date.now();
      try {
        const res = await fetch(`/api/resorts/lotte/refresh`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ checkin, checkout, branch }),
        });
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
        // 같은 날짜·지점으로 캐시 재조회
        setCommitted({ checkin, checkout, branch });
        await queryClient.invalidateQueries({ queryKey: ["inventory"] });
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

        <BranchTabs value={branch} counts={availableCounts} onChange={setBranch} />

        {!branch && (
          <p className="px-0.5 text-xs text-muted-foreground">
            전체 지점은 캐시 조회만 가능합니다. 라이브 최신화는 지점을 선택하세요.
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
            disabled={refreshing || !branch}
            title={
              !branch ? "지점을 선택하면 라이브 최신화가 가능합니다" : undefined
            }
            className="flex-1"
          >
            <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} />
            {refreshing ? "최신화 중…" : "최신화"}
          </Button>
        </div>
      </aside>

      <div data-range-dim className="min-w-0">
        <Results
          committed={committed}
          rows={rows}
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
  rows,
  isFetching,
  isError,
  error,
}: {
  committed: Committed | null;
  rows: InventoryRow[] | undefined;
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
            description="이 날짜로 수집된 기록이 아직 없습니다. 지점을 선택하고 ‘최신화’를 눌러 실시간으로 가져오세요."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <AvailabilitySummary rows={rows} committed={committed} />
      {groupByBranch(rows).map((group) => (
        <BranchResultSection key={group[0].branchName} rows={group} />
      ))}
    </div>
  );
}
