import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LEAVE_STATUS_LABEL, LEAVE_TYPE_LABEL } from "@/lib/labels";
import { LeaveStatus, LeaveType } from "@/generated/prisma/enums";

/**
 * 상태색은 primary(세이지)와 부딪히지 않도록 Tailwind 리터럴 팔레트를 쓴다 —
 * 형제 앱과 같은 예외 규칙(대기 amber / 반려 destructive / 취소 muted).
 */
const STATUS_CLASS: Record<LeaveStatus, string> = {
  [LeaveStatus.PENDING]: "bg-amber-100 text-amber-800",
  [LeaveStatus.APPROVED]: "bg-primary/10 text-primary",
  [LeaveStatus.REJECTED]: "bg-destructive/10 text-destructive",
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
