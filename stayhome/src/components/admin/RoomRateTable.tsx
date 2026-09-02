"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Info, Trash2 } from "lucide-react";

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
import { EmptyState } from "@/components/empty-state";
import { formatKrw } from "@/lib/price";
import { relativeAge } from "@/lib/freshness";
import { deleteRoomRate } from "@/actions/room-rates";

export type RateRow = {
  branchName: string;
  label: string;
  roomType: string;
  /** 1박 단가(원). 숙박 총액이 아니다. */
  perNight: number;
  note: string | null;
  updatedAt: string;
  orphan: null | "unknownBranch" | "unknownRoomType";
  hidden: boolean;
};

export type RateGroup = {
  resortId: string;
  slug: string;
  name: string;
  active: boolean;
  rates: RateRow[];
};

/**
 * 입력해 둔 수동 요금 목록.
 *
 * **이 화면은 요금을 만들지 않는다 — 수정 없이 삭제만 한다.** 생성하려면 `roomType`을
 * 사람이 타이핑해야 하는데, 그건 이 기능이 유일하게 피한 오류 경로다(입력 다이얼로그는
 * 항상 조회 화면의 실제 행에서 열려 값을 그대로 싣는다). 금액을 고치는 것도 같은
 * 이유로 조회 화면에서 한다 — 여기서 고치면 그 행이 실제로 존재하는지 알 수 없다.
 *
 * 그래서 이 화면이 답하는 질문은 하나다: **"내가 넣어 둔 요금이 지금 무엇이고, 그중
 * 아무 데도 안 붙고 있는 것은 무엇인가."**
 */
export function RoomRateTable({ resorts }: { resorts: RateGroup[] }) {
  if (resorts.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={Info}
            title="입력된 요금이 없습니다"
            description="조회 화면에서 요금이 비어 있는 객실 행의 ‘요금’ 버튼을 눌러 1박 단가를 넣으면 여기에 모입니다."
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {resorts.map((r) => (
        <ResortCard key={r.resortId} resort={r} />
      ))}
    </div>
  );
}

function ResortCard({ resort }: { resort: RateGroup }) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const orphans = resort.rates.filter((r) => r.orphan !== null);

  function onDelete(rate: RateRow) {
    const key = `${rate.branchName} / ${rate.roomType}`;
    setBusy(key);
    startTransition(async () => {
      try {
        await deleteRoomRate({
          resortSlug: resort.slug,
          branchName: rate.branchName,
          roomType: rate.roomType,
        });
        toast.success(`${rate.label} · ${rate.roomType} 요금 삭제됨`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다");
      } finally {
        setBusy(null);
      }
    });
  }

  // 삭제 버튼 렌더 함수. 모바일 카드와 데스크톱 테이블이 같은 데이터를 두 번 그리므로
  // 버튼을 두 번 쓰지 않는다 (`PropertyTable`의 관용구).
  const action = (rate: RateRow) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => onDelete(rate)}
      disabled={pending && busy === `${rate.branchName} / ${rate.roomType}`}
      title="이 객실의 수동 요금을 지웁니다"
    >
      <Trash2 className="size-3.5" />
      <span className="sr-only sm:not-sr-only">삭제</span>
    </Button>
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
          <span className="font-mono text-xs font-normal tabular-nums text-muted-foreground">
            요금 {resort.rates.length}건
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* 모바일: 카드 목록. 6열 테이블은 390px에서 읽을 수 없다. */}
        <ul className="space-y-2 md:hidden">
          {resort.rates.map((rate) => (
            <li
              key={`${rate.branchName} / ${rate.roomType}`}
              className={`rounded-lg border px-3 py-2 ${rate.hidden ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{rate.label}</span>
                    {rate.hidden && (
                      <Badge variant="secondary" className="text-[10px]">
                        조회에 안 뜸
                      </Badge>
                    )}
                    {rate.orphan && (
                      <Badge variant="outline" className="text-[10px]">
                        미부착
                      </Badge>
                    )}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {rate.roomType}
                  </div>
                  <div className="font-mono text-sm tabular-nums">
                    1박 {formatKrw(rate.perNight)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {relativeAge(rate.updatedAt)} 입력
                    {rate.note ? ` · ${rate.note}` : ""}
                  </div>
                </div>
                <div className="shrink-0">{action(rate)}</div>
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
                {/* 실제 조인 키 둘. 이게 보여야 "요금을 넣었는데 안 뜬다"를 진단할 수 있다. */}
                <TableHead>branchName</TableHead>
                <TableHead>roomType</TableHead>
                <TableHead className="w-[130px] text-right">1박 단가</TableHead>
                <TableHead className="w-[110px]">입력</TableHead>
                <TableHead>근거</TableHead>
                <TableHead className="w-[100px] text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resort.rates.map((rate) => (
                <TableRow
                  key={`${rate.branchName} / ${rate.roomType}`}
                  className={rate.hidden ? "opacity-60" : ""}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{rate.label}</span>
                      {rate.hidden && (
                        <Badge variant="secondary" className="text-[10px]">
                          조회에 안 뜸
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {rate.branchName}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate font-mono text-xs text-muted-foreground">
                    {rate.roomType}
                    {rate.orphan && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        미부착
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatKrw(rate.perNight)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {relativeAge(rate.updatedAt)}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-muted-foreground">
                    {rate.note ?? "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end">{action(rate)}</div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/*
          이 기능의 조용한 실패 자리. 요금의 지점명·객실유형이 재고와 어긋나면 그 요금은
          아무 행에도 붙지 않고, 조회 화면은 그냥 빈칸이라 아무도 모른다.

          ⚠️ 지점 제외의 "고아 규칙"과 달리 **경고색을 쓰지 않는다.** 저기는 코드 상수
          `CATALOG`와 대조해 확실하지만, 여기 정답지는 `resort_inventory`이고 그 표는
          크롤된 윈도우에만 존재한다 — 오탐이 섞일 수 있는 목록에 빨간색을 쓰면 진짜
          오타가 그 안에서 구별되지 않는다. (그래서 재고가 0행인 지점은 아예 판정을
          보류한다 — `getRoomRateAdminCatalog` 주석.)
        */}
        {orphans.length > 0 && (
          <Alert>
            <Info />
            <AlertTitle>지금 재고에 없는 객실</AlertTitle>
            <AlertDescription>
              <p>
                아래 요금은 현재 어떤 조회 행에도 붙지 않습니다. 사이트가 이름을 바꿨다면
                조회 화면에서 새 객실에 다시 넣고 이 행을 지우세요.
              </p>
              <ul className="mt-1 space-y-0.5 font-mono text-xs">
                {orphans.map((o) => (
                  <li key={`${o.branchName} / ${o.roomType}`}>
                    {o.branchName} · {o.roomType} — {formatKrw(o.perNight)}
                    {o.orphan === "unknownBranch" && " (카탈로그에 없는 지점)"}
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
