"use client";

import { useState, useTransition, type ReactElement } from "react";
import { toast } from "sonner";

import { createBranch, updateBranch } from "@/actions/branches";
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
import { WEEKDAY_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

export interface BranchFormValues {
  id?: string;
  name: string;
  address: string | null;
  phone: string | null;
  closedWeekdays: number[];
  minStaff: number | null;
}

export function BranchFormDialog({
  initial,
  trigger,
}: {
  /** 있으면 수정, 없으면 등록. */
  initial?: BranchFormValues;
  /** 트리거 요소(보통 `<Button>`). Base UI가 여기에 트리거 props를 합친다. */
  trigger: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [closed, setClosed] = useState<number[]>(initial?.closedWeekdays ?? []);
  const [pending, startTransition] = useTransition();
  const isEdit = Boolean(initial?.id);

  function toggleDay(d: number) {
    setClosed((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const minStaffRaw = String(fd.get("minStaff") ?? "").trim();
    const payload = {
      ...(initial?.id ? { id: initial.id } : {}),
      name: String(fd.get("name") ?? ""),
      address: String(fd.get("address") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      closedWeekdays: closed,
      minStaff: minStaffRaw === "" ? null : Number(minStaffRaw),
    };
    startTransition(async () => {
      const res = isEdit ? await updateBranch(payload) : await createBranch(payload);
      if (res.ok) {
        toast.success(isEdit ? "지점 정보가 수정되었습니다." : "지점이 등록되었습니다.");
        setOpen(false);
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setClosed(initial?.closedWeekdays ?? []);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{isEdit ? "지점 수정" : "지점 등록"}</DialogTitle>
            <DialogDescription>
              휴무 요일은 연차 차감 일수 계산에서 자동 제외됩니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">지점명</Label>
              <Input id="name" name="name" defaultValue={initial?.name ?? ""} required maxLength={40} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">주소</Label>
              <Input id="address" name="address" defaultValue={initial?.address ?? ""} maxLength={120} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="phone">연락처</Label>
                <Input id="phone" name="phone" defaultValue={initial?.phone ?? ""} maxLength={20} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minStaff">최소 근무 인원</Label>
                <Input
                  id="minStaff"
                  name="minStaff"
                  type="number"
                  min={0}
                  max={99}
                  inputMode="numeric"
                  placeholder="미설정"
                  defaultValue={initial?.minStaff ?? ""}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>정기 휴무 요일</Label>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_LABEL.map((label, d) => {
                  const on = closed.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleDay(d)}
                      className={cn(
                        "h-8 w-10 rounded-full border text-sm font-medium transition-colors",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {closed.length === 0
                  ? "휴무 없음 — 모든 요일 영업"
                  : `매주 ${closed.map((d) => WEEKDAY_LABEL[d]).join("·")}요일 휴무`}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              취소
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "저장 중..." : isEdit ? "저장" : "등록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
