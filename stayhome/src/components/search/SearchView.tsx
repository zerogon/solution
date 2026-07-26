"use client";

import { useMemo, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, Search, ExternalLink } from "lucide-react";

import { LOTTE } from "@/crawlers/lotte/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "__all__";

interface InventoryRow {
  id: string;
  resortName: string;
  branchName: string;
  roomType: string;
  region: string;
  available: boolean;
  closingSoon: boolean;
  detailUrl: string | null;
  syncedAt: string;
}

interface Committed {
  checkin: string;
  checkout: string;
  branch: string; // "" → 전체
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(s: string, n: number): string {
  const d = new Date(`${s}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "방금 전 갱신";
  if (min < 60) return `${min}분 전 갱신`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}시간 전 갱신`;
  return `${Math.round(hr / 24)}일 전 갱신`;
}

async function fetchInventory(c: Committed): Promise<InventoryRow[]> {
  const qs = new URLSearchParams({ checkin: c.checkin, checkout: c.checkout });
  if (c.branch) qs.set("branch", c.branch);
  const res = await fetch(`/api/inventory?${qs.toString()}`);
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body.rows as InventoryRow[];
}

export function SearchView() {
  const today = useMemo(() => isoDate(new Date()), []);
  const [checkin, setCheckin] = useState(today);
  const [checkout, setCheckout] = useState(addDays(today, 1));
  const [branch, setBranch] = useState<string>(ALL);
  const [committed, setCommitted] = useState<Committed | null>(null);

  const queryClient = useQueryClient();
  const [refreshing, startRefresh] = useTransition();

  const branchValue = branch === ALL ? "" : branch;

  const { data: rows, isFetching, isError, error } = useQuery({
    queryKey: ["inventory", committed],
    queryFn: () => fetchInventory(committed as Committed),
    enabled: committed != null,
  });

  function onSearch() {
    if (checkout <= checkin) {
      toast.error("체크아웃은 체크인 이후여야 합니다");
      return;
    }
    setCommitted({ checkin, checkout, branch: branchValue });
  }

  function onRefresh() {
    if (!branchValue) {
      toast.error("최신화하려면 지점을 선택하세요 (전체 지점은 캐시 조회만 지원)");
      return;
    }
    if (checkout <= checkin) {
      toast.error("체크아웃은 체크인 이후여야 합니다");
      return;
    }
    startRefresh(async () => {
      const start = Date.now();
      try {
        const res = await fetch(`/api/resorts/lotte/refresh`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ checkin, checkout, region: branchValue }),
        });
        const body = await res.json();
        const elapsed = Math.round((Date.now() - start) / 100) / 10;
        if (!res.ok) {
          toast.error(`최신화 실패 (${elapsed}s): ${body?.message ?? body?.error ?? `HTTP ${res.status}`}`);
          return;
        }
        if (body.status === "SUCCESS") {
          toast.success(`최신화 완료 (${elapsed}s · ${body.rowsUpserted ?? 0}건)`);
        } else {
          toast.error(`크롤링 실패 (${body.errorStage ?? "?"}): ${body.errorMessage ?? "원인 미상"}`);
        }
        // 같은 날짜·지점으로 캐시 재조회
        setCommitted({ checkin, checkout, branch: branchValue });
        await queryClient.invalidateQueries({ queryKey: ["inventory"] });
      } catch (e) {
        toast.error(`호출 오류: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* 검색 폼 */}
      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1.4fr]">
            <div className="space-y-1.5">
              <Label htmlFor="checkin">체크인</Label>
              <Input
                id="checkin"
                type="date"
                value={checkin}
                min={today}
                onChange={(e) => {
                  const v = e.target.value;
                  setCheckin(v);
                  if (checkout <= v) setCheckout(addDays(v, 1));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="checkout">체크아웃</Label>
              <Input
                id="checkout"
                type="date"
                value={checkout}
                min={addDays(checkin, 1)}
                onChange={(e) => setCheckout(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="branch">지점</Label>
              <Select value={branch} onValueChange={(v) => setBranch(v ?? ALL)}>
                <SelectTrigger id="branch" className="w-full">
                  <SelectValue placeholder="지점 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>전체 지점 (캐시 조회만)</SelectItem>
                  {LOTTE.branches.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label} · {b.region}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onSearch} disabled={isFetching}>
              <Search className="mr-1 h-4 w-4" />
              {isFetching ? "조회 중…" : "조회"}
            </Button>
            <Button
              variant="outline"
              onClick={onRefresh}
              disabled={refreshing || !branchValue}
              title={!branchValue ? "지점을 선택하면 라이브 최신화가 가능합니다" : undefined}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "최신화 중… (최대 60초)" : "최신화"}
            </Button>
            {!branchValue && (
              <span className="text-xs text-muted-foreground">
                전체 지점은 캐시 조회만 가능합니다. 라이브 최신화는 지점을 선택하세요.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 결과 */}
      <ResultList
        committed={committed}
        rows={rows}
        isFetching={isFetching}
        isError={isError}
        error={error}
      />
    </div>
  );
}

function ResultList({
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
      <p className="px-1 text-sm text-muted-foreground">
        날짜와 지점을 선택한 뒤 <b>조회</b>를 누르세요.
      </p>
    );
  }
  if (isFetching && !rows) {
    return <p className="px-1 text-sm text-muted-foreground">조회 중…</p>;
  }
  if (isError) {
    return (
      <p className="px-1 text-sm text-destructive">
        조회 오류: {error instanceof Error ? error.message : String(error)}
      </p>
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          수집된 데이터가 없습니다. 지점을 선택하고 <b>최신화</b>를 눌러 조회하세요.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs text-muted-foreground">
        {committed.checkin} → {committed.checkout} · {rows.length}건
      </p>
      {rows.map((r) => (
        <Card key={r.id}>
          <CardContent className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.roomType}</span>
                {r.available ? (
                  <Badge variant="default">예약 가능</Badge>
                ) : (
                  <Badge variant="secondary">마감</Badge>
                )}
                {r.closingSoon && <Badge variant="destructive">마감임박</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">
                {r.branchName} · {r.region} · {relativeTime(r.syncedAt)}
              </div>
            </div>
            {r.detailUrl && (
              <a
                href={r.detailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
              >
                바로가기 <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
