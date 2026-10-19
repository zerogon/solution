"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteLeaveEntry } from "@/actions/leave-entries";
import { Button } from "@/components/ui/button";

export function DeleteEntryButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm("이 기록을 지울까요? 되돌릴 수 없습니다.")) return;
    startTransition(async () => {
      const res = await deleteLeaveEntry({ id });
      if (res.ok) toast.success("기록을 지웠습니다.");
      else toast.error(res.message);
    });
  }

  return (
    <Button variant="ghost" size="icon-sm" onClick={handleClick} disabled={pending} aria-label="지우기" className="text-muted-foreground hover:text-destructive">
      <Trash2 />
    </Button>
  );
}
