"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";

import { saveLeaveYear } from "@/actions/settings";
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
 * 연도별 부여 추가·수정. 같은 연도를 다시 저장하면 덮어쓴다.
 * 이월은 지난해 남은 일수를 자동으로 끌어오지 않는다 — 회사마다 이월 규칙이 달라 엑셀처럼 직접 적는다.
 */
export function LeaveYearDialog({
  initial,
  suggestYear,
}: {
  initial?: { year: number; grantedDays: number; carriedOverDays: number; memo: string | null };
  /** 새로 추가할 때 연도 칸의 기본값. */
  suggestYear?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await saveLeaveYear({
        year: Number(fd.get("year")),
        grantedDays: Number(fd.get("grantedDays")),
        carriedOverDays: Number(fd.get("carriedOverDays") || 0),
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
      {initial ? (
        <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${initial.year}년 고치기`} />}>
          <Pencil />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button size="sm" />}>
          <Plus data-icon="inline-start" />
          연도 추가
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{initial ? `${initial.year}년 부여` : "연도별 부여 추가"}</DialogTitle>
            <DialogDescription>그 해 1월 1일 ~ 12월 31일에 쓸 수 있는 연차입니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="year">연도</Label>
              <Input
                id="year"
                name="year"
                type="number"
                min={2000}
                max={2100}
                inputMode="numeric"
                defaultValue={initial?.year ?? suggestYear}
                readOnly={Boolean(initial)}
                required
                className="font-mono tabular-nums"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="grantedDays">부여</Label>
                <Input
                  id="grantedDays"
                  name="grantedDays"
                  type="number"
                  step={0.5}
                  min={0}
                  max={60}
                  inputMode="decimal"
                  defaultValue={initial?.grantedDays ?? 15}
                  required
                  className="font-mono tabular-nums"
                />
              </div>
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
            </div>
            <div className="space-y-2">
              <Label htmlFor="memo">메모</Label>
              <Input id="memo" name="memo" maxLength={200} defaultValue={initial?.memo ?? ""} placeholder="예: 근속 3년차 가산 +1" />
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
