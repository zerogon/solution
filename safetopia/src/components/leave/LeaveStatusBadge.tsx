import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LEAVE_STATUS_LABEL, LEAVE_TYPE_LABEL } from "@/lib/labels";
import { LeaveStatus, LeaveType } from "@/generated/prisma/enums";

/** 확정은 primary(세이지), 취소는 muted. 승인 절차가 없어 상태색 예외는 이 둘뿐이다. */
const STATUS_CLASS: Record<LeaveStatus, string> = {
  [LeaveStatus.CONFIRMED]: "bg-primary/10 text-primary",
  [LeaveStatus.CANCELLED]: "bg-muted text-muted-foreground",
};

export function LeaveStatusBadge({ status, className }: { status: LeaveStatus; className?: string }) {
  return (
    <Badge variant="secondary" className={cn(STATUS_CLASS[status], className)}>
      {LEAVE_STATUS_LABEL[status]}
    </Badge>
  );
}

export function LeaveTypeBadge({ type, className }: { type: LeaveType; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-normal", className)}>
      {LEAVE_TYPE_LABEL[type]}
    </Badge>
  );
}
