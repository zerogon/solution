"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Gift, SlidersHorizontal } from "lucide-react";

import { adjustLeave, grantLeave } from "@/actions/leave-balances";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** 기본 부여·이월 설정. 이미 있으면 덮어쓴다(사용·조정 누계는 유지). */
export function GrantLeaveDialog({
  userId,
  year,
  initial,
  size = "sm",
}: {
  userId: string;
  year: number;
  initial?: { totalDays: number; carriedOverDays: number };
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await grantLeave({
        userId,
        year: Number(fd.get("year")),
        totalDays: Number(fd.get("totalDays")),
        carriedOverDays: Number(fd.get("carriedOverDays") || 0),
      });
      if (res.ok) {
        toast.success("연차를 부여했습니다.");
        setOpen(false);
      } else toast.error(res.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={initial ? "outline" : "default"} size={size} />}>
        <Gift data-icon="inline-start" />
        {initial ? "부여 수정" : "연차 부여"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>연차 부여</DialogTitle>
            <DialogDescription>연도별 기본 부여 일수와 이월 일수를 설정합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="year">연도</Label>
              <Input id="year" name="year" type="number" defaultValue={year} min={2000} max={2100} required readOnly={Boolean(initial)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="totalDays">기본 부여</Label>
                <Input id="totalDays" name="totalDays" type="number" step={0.5} min={0} max={60} inputMode="decimal" defaultValue={initial?.totalDays ?? 15} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="carriedOverDays">이월</Label>
                <Input id="carriedOverDays" name="carriedOverDays" type="number" step={0.5} min={0} max={60} inputMode="decimal" defaultValue={initial?.carriedOverDays ?? 0} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              취소
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** 수동 조정(+/-). 사유 필수, 이력 기록. */
export function AdjustLeaveDialog({ userId, year }: { userId: string; year: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await adjustLeave({
        userId,
        year,
        amount: Number(fd.get("amount")),
        reason: String(fd.get("reason") ?? ""),
      });
      if (res.ok) {
        toast.success("연차를 조정했습니다.");
        setOpen(false);
      } else toast.error(res.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <SlidersHorizontal data-icon="inline-start" />
        조정
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{year}년 연차 조정</DialogTitle>
            <DialogDescription>+1.0, -0.5 처럼 0.5 단위로 입력합니다. 사유는 이력에 남습니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="amount">조정 수치</Label>
              <Input id="amount" name="amount" type="number" step={0.5} min={-60} max={60} inputMode="decimal" placeholder="+1 / -0.5" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">사유</Label>
              <Textarea id="reason" name="reason" required maxLength={300} placeholder="예: 근속 포상 1일 추가" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              취소
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "조정 중..." : "조정"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
