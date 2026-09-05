"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";

import { adminCancelLeaveRequest } from "@/actions/leave-requests";
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
 * 관리자 행별 액션. 승인 절차가 없으므로 CONFIRMED → 취소 하나뿐이다.
 * 사유는 선택이라 다이얼로그로 받고, 감사 로그에 남는다.
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
  if (status !== LeaveStatus.CONFIRMED) return null;
  return <CancelConfirmedDialog id={id} compact={compact} />;
}

function CancelConfirmedDialog({ id, compact }: { id: string; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await adminCancelLeaveRequest({ id, reason: String(fd.get("reason") ?? "") });
      if (res.ok) {
        toast.success("연차를 취소하고 잔여를 복원했습니다.");
        setOpen(false);
      } else toast.error(res.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size={compact ? "xs" : "sm"} variant="ghost" className="text-muted-foreground" />}>
        <Undo2 data-icon="inline-start" />
        취소
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>연차 취소</DialogTitle>
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
              {pending ? "처리 중..." : "연차 취소"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
