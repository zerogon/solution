"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { updateOwnerSettings } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WEEKDAY_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** 이름과 쉬는 요일. 쉬는 요일은 이후에 적는(또는 고치는) 기록의 일수 계산에만 쓰인다. */
export function OwnerSettingsForm({ name, closedWeekdays }: { name: string; closedWeekdays: number[] }) {
  const [closed, setClosed] = useState<number[]>(closedWeekdays);
  const [pending, startTransition] = useTransition();

  function toggle(d: number) {
    setClosed((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateOwnerSettings({ name: String(fd.get("name") ?? ""), closedWeekdays: closed });
      if (res.ok) toast.success("저장했습니다.");
      else toast.error(res.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">이름</Label>
        <Input id="name" name="name" defaultValue={name} maxLength={30} required className="max-w-xs" />
      </div>
      <div className="space-y-2">
        <Label>쉬는 요일</Label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="쉬는 요일">
          {WEEKDAY_LABEL.map((w, d) => {
            const on = closed.includes(d);
            return (
              <button
                key={w}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(d)}
                className={cn(
                  "size-10 rounded-lg border text-sm font-medium transition-colors",
                  on
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted",
                )}
              >
                {w}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          고른 요일과 공휴일은 연차 일수에서 빠집니다. 이미 저장한 기록의 일수는 바뀌지 않습니다.
        </p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "저장 중..." : "저장"}
      </Button>
    </form>
  );
}
