import Link from "next/link";
import { CalendarX2, Pencil } from "lucide-react";

import { DeleteEntryButton } from "@/components/leave/DeleteEntryButton";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LEAVE_TYPE_LABEL, formatDays } from "@/lib/labels";
import { formatKoRange, toIsoDate } from "@/lib/utils";
import { LeaveType } from "@/generated/prisma/enums";

export interface LeaveEntryRow {
  id: string;
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  days: number;
  manualDays: boolean;
  memo: string;
}

function TypeBadge({ type }: { type: LeaveType }) {
  return (
    <Badge variant={type === LeaveType.FULL_DAY ? "secondary" : "outline"} className="font-normal">
      {LEAVE_TYPE_LABEL[type]}
    </Badge>
  );
}

function Actions({ id }: { id: string }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon-sm" render={<Link href={`/leaves/${id}/edit`} />} nativeButton={false} aria-label="고치기">
        <Pencil />
      </Button>
      <DeleteEntryButton id={id} />
    </div>
  );
}

/**
 * 연차 기록 목록 — 엑셀 한 줄 = 한 행. 모바일 카드 / 데스크톱 테이블.
 * `editable`이면 행 끝에 고치기·지우기를 붙인다(홈의 "최근 기록"은 읽기 전용).
 */
export function LeaveEntryList({
  rows,
  editable = true,
  emptyTitle = "기록이 없습니다",
}: {
  rows: LeaveEntryRow[];
  editable?: boolean;
  emptyTitle?: string;
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState icon={CalendarX2} title={emptyTitle} />
        </CardContent>
      </Card>
    );
  }

  const daysText = (r: LeaveEntryRow) => (
    <span className="font-mono tabular-nums" title={r.manualDays ? "직접 입력한 일수" : undefined}>
      {formatDays(r.days)}
      {r.manualDays && <span className="text-muted-foreground">*</span>}
    </span>
  );

  return (
    <>
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Card>
              <CardContent className="flex items-center justify-between gap-2 py-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-sm font-medium tabular-nums">
                      {formatKoRange(toIsoDate(r.startDate), toIsoDate(r.endDate))}
                    </span>
                    <TypeBadge type={r.type} />
                    <span className="text-xs text-muted-foreground">{daysText(r)}</span>
                  </div>
                  {r.memo && <p className="truncate text-xs text-muted-foreground">{r.memo}</p>}
                </div>
                {editable && <Actions id={r.id} />}
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>기간</TableHead>
                <TableHead>유형</TableHead>
                <TableHead className="text-right">일수</TableHead>
                <TableHead>메모</TableHead>
                {editable && <TableHead className="w-0" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono tabular-nums">
                    {formatKoRange(toIsoDate(r.startDate), toIsoDate(r.endDate))}
                  </TableCell>
                  <TableCell>
                    <TypeBadge type={r.type} />
                  </TableCell>
                  <TableCell className="text-right">{daysText(r)}</TableCell>
                  <TableCell className="max-w-80">
                    <div className="truncate text-muted-foreground" title={r.memo || undefined}>
                      {r.memo || "—"}
                    </div>
                  </TableCell>
                  {editable && (
                    <TableCell>
                      <Actions id={r.id} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
