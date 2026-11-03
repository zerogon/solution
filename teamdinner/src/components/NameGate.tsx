"use client";

import { useState } from "react";

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

interface Props {
  open: boolean;
  current: string | null;
  /** 처음 묻는 경우의 설명 문구. 변경 모드에서는 고정 문구를 쓴다. */
  description: string;
  onSubmit: (name: string) => void;
  /** 이름이 이미 있을 때(변경 모드)만 닫을 수 있다. */
  onClose?: () => void;
}

/** 로그인 대신 이름 하나. 처음 들어오면 반드시 거치고, 이후엔 바꿀 수 있다. 홈과 회식 화면이 공유한다. */
export function NameGate({ open, current, description, onSubmit, onClose }: Props) {
  const changing = current !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // 이름이 없는 첫 진입에서는 닫기 요청을 무시한다 — open이 controlled라 그대로 열려 있다.
        if (!next && changing) onClose?.();
      }}
    >
      <DialogContent showCloseButton={changing}>
        {/* key로 열릴 때마다 입력값을 current로 리셋한다 (effect 안 setState 대신). */}
        <NameForm
          key={`${open}:${current ?? ""}`}
          current={current}
          changing={changing}
          description={description}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

function NameForm({
  current,
  changing,
  description,
  onSubmit,
}: {
  current: string | null;
  changing: boolean;
  description: string;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(current ?? "");
  return (
    <form
      className="contents"
      onSubmit={(e) => {
        e.preventDefault();
        const v = name.trim();
        if (!v) return;
        onSubmit(v);
      }}
    >
      <DialogHeader>
        <DialogTitle>{changing ? "이름 바꾸기" : "이름을 알려 주세요"}</DialogTitle>
        <DialogDescription>{changing ? "이전 이름으로 담은 메뉴는 그대로 남습니다." : description}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="memberName">이름</Label>
        <Input
          id="memberName"
          className="h-10"
          maxLength={20}
          placeholder="예: 홍길동"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={!name.trim()}>
          {changing ? "변경" : "시작하기"}
        </Button>
      </DialogFooter>
    </form>
  );
}
