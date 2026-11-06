"use client";

import { useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { deletePeriodAdjustment } from "@/actions/settings";
import { Button } from "@/components/ui/button";

/** 회차의 이월·보정·메모를 지워 자동 계산값만 남긴다. 그 회차에 등록한 연차는 그대로다. */
export function ResetPeriodButton({ index, label }: { index: number; label: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm(`${label}의 이월·보정을 지울까요? 등록한 연차는 남습니다.`)) return;
    startTransition(async () => {
      const res = await deletePeriodAdjustment({ index });
      if (res.ok) toast.success("조정을 지웠습니다.");
      else toast.error(res.message);
    });
  }

  return (
    <Button variant="ghost" size="icon-sm" onClick={handleClick} disabled={pending} aria-label={`${label} 조정 지우기`} className="text-muted-foreground hover:text-destructive">
      <RotateCcw />
    </Button>
  );
}
