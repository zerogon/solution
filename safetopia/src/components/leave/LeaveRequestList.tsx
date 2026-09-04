import type { ReactNode } from "react";
import { CalendarX2 } from "lucide-react";

import { LeaveStatusBadge, LeaveTypeBadge } from "@/components/leave/LeaveStatusBadge";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDays } from "@/lib/labels";
import { formatKoRange, formatKstDateTime, toIsoDate } from "@/lib/utils";
import { LeaveStatus, type LeaveType } from "@/generated/prisma/enums";

export interface LeaveRequestRow {
  id: string;
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  days: number;
  reason: string;
  status: LeaveStatus;
  rejectionReason: string | null;
  createdAt: Date;
  approvedAt: Date | null;
  approvedBy?: { name: string } | null;
  /** 관리자 목록에서만 채운다. */
  user?: { name: string; branch: { name: string } | null } | null;
}

/**
 * 신청 목록 — 모바일 카드 / 데스크톱 테이블. 직원 이력·관리자 목록·직원 상세가 공유한다.
 * `renderAction`으로 행별 버튼(취소/승인/반려)을 끼운다.
 */
export function LeaveRequestList({
  rows,
  showUser = false,
  emptyTitle = "신청 내역이 없습니다",
  renderAction,
}: {
  rows: LeaveRequestRow[];
  showUser?: boolean;
  emptyTitle?: string;
  renderAction?: (row: LeaveRequestRow) => ReactNode;
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

  return (
    <>
      <ul className="space-y-2 md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Card>
              <CardContent className="space-y-2 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {showUser && r.user && (
                      <div className="text-xs text-muted-foreground">
                        {r.user.name} · {r.user.branch?.name ?? "소속 없음"}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-sm font-medium tabular-nums">
                        {formatKoRange(toIsoDate(r.startDate), toIsoDate(r.endDate))}
                      </span>
                      <LeaveTypeBadge type={r.type} />
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatDays(r.days)}</span>
                    </div>
                  </div>
                  <LeaveStatusBadge status={r.status} />
                </div>
                {/* 연차 사유 비활성: <p className="text-sm text-foreground/80">{r.reason}</p> */}
                {r.status === LeaveStatus.REJECTED && r.rejectionReason && (
                  <p className="text-xs text-destructive">반려 사유: {r.rejectionReason}</p>
                )}
                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>
                    신청 {formatKstDateTime(r.createdAt)}
                    {r.approvedAt && r.approvedBy && ` · 처리 ${formatKstDateTime(r.approvedAt)} ${r.approvedBy.name}`}
                  </span>
                  {renderAction && <span>{renderAction(r)}</span>}
                </div>
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
                {showUser && <TableHead>직원</TableHead>}
                <TableHead>기간</TableHead>
                <TableHead>유형</TableHead>
                <TableHead className="text-right">일수</TableHead>
                {/* 연차 사유 비활성: <TableHead>사유</TableHead> */}
                <TableHead>상태</TableHead>
                <TableHead>비고</TableHead>
                <TableHead>신청</TableHead>
                <TableHead>처리</TableHead>
                {renderAction && <TableHead className="w-0" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  {showUser && (
                    <TableCell>
                      <div className="font-medium">{r.user?.name}</div>
                      <div className="text-xs text-muted-foreground">{r.user?.branch?.name ?? "소속 없음"}</div>
                    </TableCell>
                  )}
                  <TableCell className="font-mono tabular-nums">
                    {formatKoRange(toIsoDate(r.startDate), toIsoDate(r.endDate))}
                  </TableCell>
                  <TableCell>
                    <LeaveTypeBadge type={r.type} />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{r.days}</TableCell>
                  <TableCell>
                    <LeaveStatusBadge status={r.status} />
                  </TableCell>
                  {/* 연차 사유 비활성 — 반려 사유만 상태 열 옆에 남긴다.
                  <TableCell className="max-w-64">
                    <div className="truncate" title={r.reason}>{r.reason}</div>
                  </TableCell> */}
                  <TableCell className="max-w-64">
                    {r.status === LeaveStatus.REJECTED && r.rejectionReason ? (
                      <div className="truncate text-xs text-destructive" title={r.rejectionReason}>
                        반려: {r.rejectionReason}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs tabular-nums text-muted-foreground">{formatKstDateTime(r.createdAt)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.approvedAt ? (
                      <>
                        <span className="font-mono tabular-nums">{formatKstDateTime(r.approvedAt)}</span>
                        {r.approvedBy && ` ${r.approvedBy.name}`}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  {renderAction && <TableCell className="text-right">{renderAction(r)}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
