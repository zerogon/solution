import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { LeaveTypeBadge } from "@/components/leave/LeaveStatusBadge";
import { AdminRequestActions } from "@/components/admin/AdminRequestActions";
import { HeadcountChip } from "@/components/admin/HeadcountChip";
import { formatDays } from "@/lib/labels";
import { formatKoRange, formatKstDateTime, toIsoDate } from "@/lib/utils";
import type { DayHeadcount } from "@/lib/headcount";
import type { LeaveType } from "@/generated/prisma/enums";
import { LeaveStatus } from "@/generated/prisma/enums";

export interface PendingRequestView {
  id: string;
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  days: number;
  reason: string;
  createdAt: Date;
  user: { id: string; name: string; branch: { name: string; minStaff: number | null } | null };
  worst: DayHeadcount | null;
}

export function PendingRequestCard({ r }: { r: PendingRequestView }) {
  return (
    <Card>
      <CardContent className="space-y-2.5 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link href={`/admin/employees/${r.user.id}`} className="font-medium hover:underline">
                {r.user.name}
              </Link>
              <span className="text-xs text-muted-foreground">{r.user.branch?.name ?? "소속 없음"}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-sm font-medium tabular-nums">
                {formatKoRange(toIsoDate(r.startDate), toIsoDate(r.endDate))}
              </span>
              <LeaveTypeBadge type={r.type} />
              <span className="font-mono text-xs text-muted-foreground tabular-nums">{formatDays(r.days)}</span>
            </div>
          </div>
          <HeadcountChip worst={r.worst} minStaff={r.user.branch?.minStaff ?? null} />
        </div>
        <p className="text-sm text-foreground/80">{r.reason}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">신청 {formatKstDateTime(r.createdAt)}</span>
          <AdminRequestActions id={r.id} status={LeaveStatus.PENDING} />
        </div>
      </CardContent>
    </Card>
  );
}
