"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Eye, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExcludePropertyDialog } from "./ExcludePropertyDialog";
import { includeProperty } from "@/actions/properties";

export type PropertyRow = {
  /** `ResortInventory.branchName`과 문자 단위로 같은 값. 실제 조인 키다. */
  branchName: string;
  label: string;
  region: string;
  excluded: boolean;
  reason: string | null;
  inventoryRows: number;
};

export type ResortGroup = {
  resortId: string;
  slug: string;
  name: string;
  active: boolean;
  properties: PropertyRow[];
  orphanExclusions: Array<{ branchName: string; reason: string | null }>;
};

export function PropertyTable({ resorts }: { resorts: ResortGroup[] }) {
  return (
    <div className="space-y-4">
      {resorts.map((r) => (
        <ResortCard key={r.resortId} resort={r} />
      ))}
    </div>
  );
}

function ResortCard({ resort }: { resort: ResortGroup }) {
  const [pending, startTransition] = useTransition();

  const excluded = resort.properties.filter((p) => p.excluded);
  const live = resort.properties.length - excluded.length;
  // 마지막 남은 지점은 뺄 수 없다. 지점이 0곳이면 그 리조트는 매 핫 윈도우에서 0행이
  // 되고 백스톱이 그것을 "낡음"으로 읽어 매일 헛수고한다 — 리조트를 끄는 스위치는
  // `Resort.active`로 이미 따로 있다. 서버 액션도 같은 판정을 하지만, 눌러 보고
  // 거절당하는 것보다 눌리지 않는 편이 낫다.
  const lastOne = live <= 1;

  function onInclude(p: PropertyRow) {
    startTransition(async () => {
      try {
        await includeProperty(resort.resortId, p.branchName);
        toast.success(`${p.label} 복구됨 — 재고는 다음 수집부터 채워집니다`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "복구에 실패했습니다");
      }
    });
  }

  function onDropOrphan(branchName: string) {
    if (!confirm(`"${branchName}" 제외 규칙을 지울까요?`)) return;
    startTransition(async () => {
      try {
        await includeProperty(resort.resortId, branchName);
        toast.success("고아 규칙을 지웠습니다");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다");
      }
    });
  }

  const action = (p: PropertyRow) =>
    p.excluded ? (
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => onInclude(p)}
        title="조회·수집에 다시 포함"
      >
        <Eye className="size-3.5" />
        <span className="sr-only sm:not-sr-only">복구</span>
      </Button>
    ) : (
      <span title={lastOne ? "마지막 지점입니다 — 리조트 전체를 끄려면 scripts/set-active.ts" : undefined}>
        {lastOne ? (
          <Button variant="ghost" size="sm" disabled>
            제외
          </Button>
        ) : (
          <ExcludePropertyDialog
            resortId={resort.resortId}
            resortName={resort.name}
            property={p}
          />
        )}
      </span>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span>{resort.name}</span>
          {!resort.active && (
            <Badge variant="secondary" className="text-[10px]">
              inactive
            </Badge>
          )}
          <span className="font-mono text-xs tabular-nums font-normal text-muted-foreground">
            {live}/{resort.properties.length} 운영
          </span>
        </CardTitle>
        {excluded.length > 0 && (
          <p className="text-xs text-muted-foreground">
            제외: {excluded.map((p) => p.label).join(", ")}
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {/* 모바일: 카드 목록. 5열 테이블은 390px에서 읽을 수 없다. */}
        <ul className="space-y-2 md:hidden">
          {resort.properties.map((p) => (
            <li
              key={p.branchName}
              className={`rounded-lg border px-3 py-2 ${p.excluded ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{p.label}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {p.region}
                    </Badge>
                    {p.excluded && (
                      <Badge variant="secondary" className="text-[10px]">
                        제외
                      </Badge>
                    )}
                  </div>
                  <div className="truncate font-mono text-xs text-muted-foreground">
                    {p.branchName}
                  </div>
                  <div className="font-mono text-xs tabular-nums text-muted-foreground">
                    재고 {p.inventoryRows.toLocaleString()}행
                  </div>
                  {p.reason && (
                    <p className="truncate text-xs text-muted-foreground">{p.reason}</p>
                  )}
                </div>
                <div className="shrink-0">{action(p)}</div>
              </div>
            </li>
          ))}
        </ul>

        {/* 데스크톱: 테이블 */}
        <div className="hidden overflow-hidden rounded-lg border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>지점</TableHead>
                {/* 실제 조인 키. 이게 보여야 "필터를 눌렀는데 0건"을 진단할 수 있다. */}
                <TableHead>branchName</TableHead>
                <TableHead className="w-[90px]">지역</TableHead>
                <TableHead className="w-[110px] text-right">재고</TableHead>
                <TableHead>사유</TableHead>
                <TableHead className="w-[110px] text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resort.properties.map((p) => (
                <TableRow key={p.branchName} className={p.excluded ? "opacity-60" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{p.label}</span>
                      {p.excluded && (
                        <Badge variant="secondary" className="text-[10px]">
                          제외
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {p.branchName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.region}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                    {p.inventoryRows.toLocaleString()}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-muted-foreground">
                    {p.reason ?? "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end">{action(p)}</div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/*
          이 설계에서 유일하게 조용한 실패. 제외 규칙의 지점 이름이 크롤러 config와
          어긋나면 그 규칙은 아무것도 걸러내지 않고, 그 지점이 조회 화면에 말없이
          돌아온다. 막을 수는 없으니 이름을 대게 한다.
        */}
        {resort.orphanExclusions.length > 0 && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>카탈로그에 없는 제외 규칙</AlertTitle>
            <AlertDescription>
              <p>
                이 규칙들은 아무것도 걸러내지 않습니다 — 크롤러의 지점 이름이 바뀌었을 수
                있습니다. 지금 어떤 지점이 조회 화면에 그대로 보이고 있는지 확인하세요.
              </p>
              <ul className="mt-2 space-y-1">
                {resort.orphanExclusions.map((o) => (
                  <li key={o.branchName} className="flex items-center gap-2">
                    <span className="font-mono text-xs">{o.branchName}</span>
                    {o.reason && (
                      <span className="text-xs text-muted-foreground">{o.reason}</span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => onDropOrphan(o.branchName)}
                    >
                      규칙 삭제
                    </Button>
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
