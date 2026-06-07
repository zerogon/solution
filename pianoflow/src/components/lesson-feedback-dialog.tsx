"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MessageSquare, MessageSquarePlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  markFeedbackReadAction,
  saveReservationFeedbackAction,
} from "@/actions/reservations";

const MAX_LEN = 1000;

interface Props {
  reservationId: string;
  studentName: string;
  /** 예: "06.07 (토) 14:00" */
  whenLabel: string;
  initialFeedback: string;
  /** true = 선생님(작성/수정), false = 학생(읽기 전용) */
  editable: boolean;
  /** 읽기 전용 모드에서 아직 확인하지 않은 새 피드백이면 true → 빨간 표시 */
  unread?: boolean;
}

export function LessonFeedbackDialog({
  reservationId,
  studentName,
  whenLabel,
  initialFeedback,
  editable,
  unread = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialFeedback);
  const [saved, setSaved] = useState(initialFeedback);
  const [pending, startTransition] = useTransition();

  const hasFeedback = saved.trim().length > 0;

  // 읽기 전용인데 피드백이 없으면 아무것도 렌더링하지 않음
  if (!editable && !hasFeedback) return null;

  function save() {
    startTransition(async () => {
      const res = await saveReservationFeedbackAction({
        reservationId,
        feedback: value,
      });
      if (res.ok) {
        setSaved(value);
        toast.success(
          value.trim() ? "피드백을 저장했습니다." : "피드백을 삭제했습니다.",
        );
        setOpen(false);
      } else {
        toast.error(res.message);
      }
    });
  }

  function onOpenChange(next: boolean) {
    // 닫을 때는 미저장 입력을 마지막 저장값으로 되돌림
    if (!next) setValue(saved);
    setOpen(next);
  }

  function openReadOnly() {
    setOpen(true);
    // 학생이 열어 확인하면 읽음 처리 → 빨간 배지/네비 숫자 사라짐
    if (unread) {
      startTransition(async () => {
        await markFeedbackReadAction({ reservationId });
      });
    }
  }

  return (
    <>
      {editable ? (
        <Button
          type="button"
          size="sm"
          variant={hasFeedback ? "default" : "outline"}
          onClick={() => setOpen(true)}
        >
          <MessageSquarePlus aria-hidden className="size-3.5" />
          피드백
        </Button>
      ) : (
        <Badge
          variant={unread ? "destructive" : "secondary"}
          className="cursor-pointer"
          render={<button type="button" onClick={openReadOnly} />}
        >
          {unread && (
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-destructive"
            />
          )}
          <MessageSquare aria-hidden className="size-3" />
          {unread ? "새 피드백" : "선생님 피드백"}
        </Badge>
      )}

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {studentName} 학생 · 수업 피드백
            </DialogTitle>
            <DialogDescription>{whenLabel} 레슨</DialogDescription>
          </DialogHeader>

          {editable ? (
            <div className="space-y-1.5">
              <textarea
                value={value}
                onChange={(e) => setValue(e.target.value.slice(0, MAX_LEN))}
                rows={6}
                placeholder="오늘 수업에서 다룬 내용, 잘한 점, 다음 시간까지 연습할 부분 등을 적어주세요."
                className={cn(
                  "w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm transition-colors outline-none",
                  "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                  "disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30",
                )}
                disabled={pending}
              />
              <div className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                {value.length}/{MAX_LEN}
              </div>
            </div>
          ) : (
            <p className="text-sm whitespace-pre-wrap break-words text-foreground">
              {saved}
            </p>
          )}

          <DialogFooter>
            {editable ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={pending}
                >
                  닫기
                </Button>
                <Button onClick={save} disabled={pending}>
                  {pending ? "저장 중..." : "저장"}
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setOpen(false)}>
                닫기
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
