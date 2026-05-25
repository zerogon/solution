"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import type { Slot } from "@/lib/slots";
import {
  createReservationAction,
  cancelReservationAction,
} from "@/actions/reservations";

interface Props {
  teacherId: string;
  teacherName: string;
  dateStr: string;
  slots: Slot[];
  reservationByIso?: Record<string, string>; // iso -> reservationId (내 예약)
  asAdmin?: boolean;
  studentId?: string; // 관리자 강제 예약 시 학생 지정
  readOnly?: boolean;
}

const STATE_STYLES: Record<Slot["state"], string> = {
  available:
    "bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100",
  booked: "bg-zinc-200 text-zinc-500 border-zinc-300 cursor-not-allowed",
  mine: "bg-blue-100 text-blue-900 border-blue-400 hover:bg-blue-200",
  unavailable:
    "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed opacity-60",
};

const STATE_LABEL: Record<Slot["state"], string> = {
  available: "예약 가능",
  booked: "예약 완료",
  mine: "내 예약",
  unavailable: "불가",
};

export function SlotGrid({
  teacherId,
  teacherName,
  dateStr,
  slots,
  reservationByIso = {},
  asAdmin = false,
  studentId,
  readOnly = false,
}: Props) {
  const [pendingSlot, setPendingSlot] = useState<Slot | null>(null);
  const [pending, startTransition] = useTransition();

  function onClick(slot: Slot) {
    if (readOnly) return;
    if (slot.state === "unavailable" || slot.state === "booked") return;
    setPendingSlot(slot);
  }

  function confirm() {
    if (!pendingSlot) return;
    const slot = pendingSlot;
    startTransition(async () => {
      if (slot.state === "mine") {
        const reservationId = reservationByIso[slot.iso];
        if (!reservationId) return;
        const res = await cancelReservationAction({ reservationId });
        if (res.ok) toast.success("예약이 취소되었습니다.");
        else toast.error(res.message);
      } else {
        const res = await createReservationAction({
          teacherId,
          slotIso: slot.iso,
          studentId: asAdmin ? studentId : undefined,
        });
        if (res.ok) toast.success("예약이 완료되었습니다.");
        else toast.error(res.message);
      }
      setPendingSlot(null);
    });
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
        {slots.map((slot) => (
          <button
            key={slot.iso}
            type="button"
            onClick={() => onClick(slot)}
            disabled={
              readOnly ||
              slot.state === "unavailable" ||
              slot.state === "booked"
            }
            className={cn(
              "rounded-lg border px-3 py-3 text-sm font-medium transition",
              STATE_STYLES[slot.state],
            )}
          >
            <div className="text-base font-semibold">
              {String(slot.hour).padStart(2, "0")}:00
            </div>
            <div className="text-[11px] mt-0.5 opacity-80">
              {STATE_LABEL[slot.state]}
            </div>
          </button>
        ))}
      </div>

      <Dialog
        open={pendingSlot !== null}
        onOpenChange={(open) => !open && setPendingSlot(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingSlot?.state === "mine" ? "예약 취소" : "예약 확인"}
            </DialogTitle>
            <DialogDescription>
              {teacherName} 선생님 · {dateStr} {pendingSlot?.hour}:00
              {pendingSlot?.state === "mine"
                ? " 예약을 취소하시겠습니까?"
                : " 예약을 진행하시겠습니까?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingSlot(null)}
              disabled={pending}
            >
              닫기
            </Button>
            <Button onClick={confirm} disabled={pending}>
              {pending ? "처리 중..." : "확인"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
