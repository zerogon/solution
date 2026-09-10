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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatDays } from "@/lib/labels";

/**
 * 회차의 부여·이월 설정.
 *
 * 부여는 기본이 **자동 계산**(입사일 기준)이고, 스위치를 끌 때만 수동 값을 보낸다.
 * 자동으로 되돌리면 `totalDays: null`이 가고, 1년 미만 회차는 다시 매달 늘어난다.
 */
export function GrantLeaveDialog({
  userId,
  periodIndex,
  periodLabel,
  autoDays,
  initial,
  size = "sm",
}: {
  userId: string;
  periodIndex: number;
  periodLabel: string;
  /** 수동 부여를 해제했을 때 돌아갈 값. 수동 입력의 기본값이기도 하다. */
  autoDays: number;
  initial?: { totalDays: number | null; carriedOverDays: number };
  size?: "sm" | "default";
}) {
  const [open, setOpen] = useState(false);
  const [auto, setAuto] = useState(initial?.totalDays == null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await grantLeave({
        userId,
        periodIndex,
        totalDays: auto ? null : Number(fd.get("totalDays")),
        carriedOverDays: Number(fd.get("carriedOverDays") || 0),
      });
      if (res.ok) {
        toast.success(auto ? "자동 계산으로 되돌렸습니다." : "연차를 부여했습니다.");
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
            <DialogDescription>{periodLabel}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <Label htmlFor="autoGrant" className="cursor-pointer">
                  자동 계산 사용
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  입사일 기준{" "}
                  <span className="font-mono tabular-nums text-foreground">{formatDays(autoDays)}</span>
                </p>
              </div>
              <Switch id="autoGrant" checked={auto} onCheckedChange={setAuto} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="totalDays">기본 부여</Label>
                <Input
                  id="totalDays"
                  name="totalDays"
                  type="number"
                  step={0.5}
                  min={0}
                  max={60}
                  inputMode="decimal"
                  defaultValue={initial?.totalDays ?? autoDays}
                  disabled={auto}
                  required={!auto}
                />
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
export function AdjustLeaveDialog({
  userId,
  periodIndex,
  periodLabel,
}: {
  userId: string;
  periodIndex: number;
  periodLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await adjustLeave({
        userId,
        periodIndex,
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
            <DialogTitle>연차 조정</DialogTitle>
            <DialogDescription>{periodLabel}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">+1.0, -0.5 처럼 0.5 단위로 입력합니다. 사유는 이력에 남습니다.</p>
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
