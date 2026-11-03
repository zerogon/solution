"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/client-api";
import type { EventDto } from "@/lib/events";

interface Props {
  event: EventDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 삭제가 끝난 뒤(회식 화면이면 홈으로 이동). */
  onDeleted?: () => void;
}

/** 삭제 확인. 로그인이 없어 누구나 지울 수 있으므로 무엇이 같이 지워지는지 분명히 말한다. */
export function EventDeleteDialog({ event, open, onOpenChange, onDeleted }: Props) {
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (slug: string) => api.deleteEvent(slug),
    onSuccess: (_r, slug) => {
      toast.success("회식을 삭제했습니다");
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.removeQueries({ queryKey: ["event", slug] });
      onOpenChange(false);
      onDeleted?.();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <Dialog open={open && event !== null} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>「{event?.title}」을(를) 삭제할까요?</DialogTitle>
          <DialogDescription>
            팀원들이 담은 메뉴와 장바구니도 함께 지워지며 되돌릴 수 없습니다.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>취소</DialogClose>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => event && remove.mutate(event.slug)}
          >
            삭제
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
