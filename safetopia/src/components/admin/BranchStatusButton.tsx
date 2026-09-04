"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { changeBranchStatus } from "@/actions/branches";
import { Button } from "@/components/ui/button";
import { BranchStatus } from "@/generated/prisma/enums";

export function BranchStatusButton({ id, status }: { id: string; status: BranchStatus }) {
  const [pending, startTransition] = useTransition();
  const next = status === BranchStatus.ACTIVE ? BranchStatus.INACTIVE : BranchStatus.ACTIVE;

  function run() {
    if (next === BranchStatus.INACTIVE && !window.confirm("이 지점을 비활성화할까요? 과거 기록은 유지됩니다.")) return;
    startTransition(async () => {
      const res = await changeBranchStatus({ id, status: next });
      if (res.ok) toast.success(next === BranchStatus.ACTIVE ? "지점을 다시 운영합니다." : "지점을 비활성화했습니다.");
      else toast.error(res.message);
    });
  }

  return (
    <Button
      size="sm"
      variant={next === BranchStatus.INACTIVE ? "ghost" : "outline"}
      className={next === BranchStatus.INACTIVE ? "text-muted-foreground" : undefined}
      onClick={run}
      disabled={pending}
    >
      {next === BranchStatus.INACTIVE ? "비활성화" : "재개"}
    </Button>
  );
}
