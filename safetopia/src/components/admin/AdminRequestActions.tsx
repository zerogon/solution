"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Undo2, X } from "lucide-react";

import { adminCancelLeaveRequest, approveLeaveRequest, rejectLeaveRequest } from "@/actions/leave-requests";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LeaveStatus } from "@/generated/prisma/enums";

/**
 * 관리자 행별 액션. PENDING → 승인/반려, APPROVED → 승인 취소.
 * 반려는 사유 필수라 다이얼로그(FR-006), 승인은 확인 창 하나.
 */
export function AdminRequestActions({
  id,
  status,
  compact = false,
}: {
  id: string;
  status: LeaveStatus;
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function approve() {
    if (!window.confirm("이 신청을 승인할까요? 승인 즉시 연차가 차감됩니다.")) return;
    startTransition(async () => {
      const res = await approveLeaveRequest({ id });
      if (res.ok) toast.success("승인했습니다.");
      else toast.error(res.message);
    });
  }

  if (status === LeaveStatus.PENDING) {
    return (
      <span className="inline-flex items-center gap-1">
        <Button size={compact ? "xs" : "sm"} onClick={approve} disabled={pending}>
          <Check data-icon="inline-start" />
          승인
        </Button>
        <RejectDialog id={id} compact={compact} />
      </span>
    );
  }
  if (status === LeaveStatus.APPROVED) {
    return <CancelApprovedDialog id={id} compact={compact} />;
  }
  return null;
}

function RejectDialog({ id, compact }: { id: string; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await rejectLeaveRequest({ id, reason: String(fd.get("reason") ?? "") });
      if (res.ok) {
        toast.success("반려했습니다.");
        setOpen(false);
      } else toast.error(res.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size={compact ? "xs" : "sm"} variant="outline" />}>
        <X data-icon="inline-start" />
        반려
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>신청 반려</DialogTitle>
            <DialogDescription>반려 사유는 직원에게 그대로 표시됩니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">반려 사유</Label>
            <Textarea id="reason" name="reason" required maxLength={300} placeholder="예: 해당 일자 지점 인원 부족" autoFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              취소
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "반려 중..." : "반려"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CancelApprovedDialog({ id, compact }: { id: string; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await adminCancelLeaveRequest({ id, reason: String(fd.get("reason") ?? "") });
      if (res.ok) {
        toast.success("승인을 취소하고 연차를 복원했습니다.");
        setOpen(false);
      } else toast.error(res.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size={compact ? "xs" : "sm"} variant="ghost" className="text-muted-foreground" />}>
        <Undo2 data-icon="inline-start" />
        승인 취소
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>승인 취소</DialogTitle>
            <DialogDescription>차감된 연차가 복원되고 해당 날짜는 다시 신청할 수 있게 됩니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">사유 (선택)</Label>
            <Textarea id="reason" name="reason" maxLength={300} placeholder="예: 직원 요청" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              닫기
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "처리 중..." : "승인 취소"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
