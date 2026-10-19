"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteLeaveYear } from "@/actions/settings";
import { Button } from "@/components/ui/button";

export function DeleteYearButton({ year }: { year: number }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm(`${year}년 부여를 지울까요? 그 해의 연차 기록은 남습니다.`)) return;
    startTransition(async () => {
      const res = await deleteLeaveYear({ year });
      if (res.ok) toast.success(`${year}년 부여를 지웠습니다.`);
      else toast.error(res.message);
    });
  }

  return (
    <Button variant="ghost" size="icon-sm" onClick={handleClick} disabled={pending} aria-label={`${year}년 부여 지우기`} className="text-muted-foreground hover:text-destructive">
      <Trash2 />
    </Button>
  );
}
