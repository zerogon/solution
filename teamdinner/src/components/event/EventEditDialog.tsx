"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/client-api";
import type { EventDto } from "@/lib/events";

interface Props {
  event: EventDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 제목·날짜·인원 수정. 히스토리 카드와 회식 화면 헤더가 공유한다. */
export function EventEditDialog({ event, open, onOpenChange }: Props) {
  return (
    <Dialog open={open && event !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        {event && <EditForm key={`${event.slug}:${open}`} event={event} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ event, onDone }: { event: EventDto; onDone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(event.title);
  const [eventDate, setEventDate] = useState(event.eventDate);
  const [headcount, setHeadcount] = useState(String(event.headcount));

  const save = useMutation({
    mutationFn: () =>
      api.updateEvent(event.slug, {
        title: title.trim(),
        eventDate,
        headcount: Number(headcount),
      }),
    onSuccess: () => {
      toast.success("회식 정보를 바꿨습니다");
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["event", event.slug] });
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  const valid = title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(eventDate) && Number(headcount) >= 1;

  return (
    <form
      className="contents"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || save.isPending) return;
        save.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle>회식 정보 수정</DialogTitle>
        <DialogDescription>{event.placeName}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="editTitle">회식 이름</Label>
          <Input id="editTitle" className="h-10" maxLength={40} value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="editDate">회식 날짜</Label>
            <Input id="editDate" type="date" className="h-10" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="editHeadcount">예상 인원</Label>
            <Input
              id="editHeadcount"
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              className="h-10 font-mono tabular-nums"
              value={headcount}
              onChange={(e) => setHeadcount(e.target.value)}
              required
            />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={!valid || save.isPending}>
          저장
        </Button>
      </DialogFooter>
    </form>
  );
}
