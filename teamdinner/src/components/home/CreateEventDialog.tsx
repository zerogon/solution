"use client";

import { PlusIcon } from "lucide-react";
import { useState } from "react";

import { CreateEventForm } from "@/components/home/CreateEventForm";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  defaultDate: string;
  /** 트리거 버튼 모양. 홈 상단은 크게, 빈 목록 안은 작게. */
  size?: "lg" | "default";
  variant?: "default" | "outline";
  className?: string;
}

/** 「새 회식 만들기」 버튼 + 만들기 폼 다이얼로그. 홈 어디서든 같은 폼을 연다. */
export function CreateEventDialog({ defaultDate, size = "default", variant = "default", className }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size={size} variant={variant} className={className} />}>
        <PlusIcon data-icon="inline-start" /> 새 회식 만들기
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>새 회식 만들기</DialogTitle>
          <DialogDescription>
            네이버 지도에서 식당의 「공유」 링크를 복사해 붙여넣으면 메뉴판이 자동으로 들어옵니다.
          </DialogDescription>
        </DialogHeader>
        <CreateEventForm defaultDate={defaultDate} onCreated={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
