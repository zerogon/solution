"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteLeaveEntry } from "@/actions/leave-entries";
import { LeaveEntryForm, type EntryFormInitial } from "@/components/leave/LeaveEntryForm";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { HolidayMap } from "@/lib/holidays-kr";

/**
 * 캘린더의 기록 추가·수정 창. 열림 상태는 URL(`?add=` / `?entry=`)이 갖는다 — 그래서 달력 칸은
 * 서버 컴포넌트의 평범한 링크로 남고, 닫기는 그 파라미터를 지운 주소로 돌아가는 것이다.
 */
export function EntryDialog({
  closeHref,
  description,
  initial,
  ...formProps
}: {
  /** 창을 닫을 때 돌아갈 주소(보던 달). */
  closeHref: string;
  description: string;
  closedWeekdays: number[];
  holidays: { covered: number[]; years: Record<string, HolidayMap> };
  remainingByYear: Record<number, number>;
  defaultDate: string;
  initial?: EntryFormInitial;
}) {
  const router = useRouter();
  const [deleting, startDelete] = useTransition();

  function close() {
    router.replace(closeHref, { scroll: false });
  }

  function handleDelete() {
    if (!initial || !window.confirm("이 기록을 지울까요? 되돌릴 수 없습니다.")) return;
    startDelete(async () => {
      const res = await deleteLeaveEntry({ id: initial.id });
      if (res.ok) {
        toast.success("기록을 지웠습니다.");
        close();
      } else toast.error(res.message);
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "기록 고치기" : "연차 기록"}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {/* key: 다른 칸을 눌러 창이 바로 바뀌면 폼 상태도 새로 시작해야 한다. */}
        <LeaveEntryForm key={initial?.id ?? formProps.defaultDate} {...formProps} initial={initial} onDone={close} />
        {initial && (
          <Button
            type="button"
            variant="ghost"
            onClick={handleDelete}
            disabled={deleting}
            className="w-full text-muted-foreground hover:text-destructive"
          >
            <Trash2 data-icon="inline-start" />
            {deleting ? "지우는 중..." : "이 기록 지우기"}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
