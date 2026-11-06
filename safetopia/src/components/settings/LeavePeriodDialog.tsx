"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";

import { savePeriodAdjustment } from "@/actions/settings";
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

/**
 * 회차 조정(이월·보정·메모). 발생 일수는 입력하지 않는다 — 입사일로 계산한다.
 * 이월은 지난 회차 잔여를 자동으로 끌어오지 않는다(법은 소멸, 회사는 제각각) — 엑셀처럼 직접 적는다.
 */
export function LeavePeriodDialog({
  index,
  label,
  initial,
}: {
  index: number;
  label: string;
  initial?: { carriedOverDays: number; adjustedDays: number; memo: string | null };
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await savePeriodAdjustment({
        index,
        carriedOverDays: Number(fd.get("carriedOverDays") || 0),
        adjustedDays: Number(fd.get("adjustedDays") || 0),
        memo: String(fd.get("memo") ?? ""),
      });
      if (res.ok) {
        toast.success("저장했습니다.");
        setOpen(false);
      } else toast.error(res.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${label} 조정`} />}>
        <Pencil />
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle className="break-keep">{label}</DialogTitle>
            <DialogDescription>발생 일수는 입사일로 자동 계산됩니다. 회사 사정으로 다른 만큼만 적습니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="carriedOverDays">이월</Label>
                <Input
                  id="carriedOverDays"
                  name="carriedOverDays"
                  type="number"
                  step={0.5}
                  min={0}
                  max={60}
                  inputMode="decimal"
                  defaultValue={initial?.carriedOverDays ?? 0}
                  className="font-mono tabular-nums"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="adjustedDays">보정</Label>
                <Input
                  id="adjustedDays"
                  name="adjustedDays"
                  type="number"
                  step={0.5}
                  min={-60}
                  max={60}
                  inputMode="decimal"
                  defaultValue={initial?.adjustedDays ?? 0}
                  className="font-mono tabular-nums"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="memo">메모</Label>
              <Input id="memo" name="memo" maxLength={200} defaultValue={initial?.memo ?? ""} placeholder="예: 2년차 잔여 중 2일 이월" />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
