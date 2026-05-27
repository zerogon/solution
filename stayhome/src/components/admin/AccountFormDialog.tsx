"use client";

import { ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  createResortAccount,
  updateResortAccount,
} from "@/actions/accounts";
import type { AccountRow, ResortOption } from "./AccountTable";

type Props = {
  mode: "create" | "edit";
  resorts: ResortOption[];
  existing?: AccountRow;
  trigger?: ReactNode;
};

export function AccountFormDialog({ mode, resorts, existing, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [resortId, setResortId] = useState<string>(existing?.resortId ?? resorts[0]?.id ?? "");
  const [label, setLabel] = useState<string>(existing?.label ?? "기본 계정");
  const [loginId, setLoginId] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [memo, setMemo] = useState<string>(existing?.memo ?? "");
  const [isPrimary, setIsPrimary] = useState<boolean>(existing?.isPrimary ?? true);

  function reset() {
    if (mode === "create") {
      setResortId(resorts[0]?.id ?? "");
      setLabel("기본 계정");
      setMemo("");
      setIsPrimary(true);
    }
    setLoginId("");
    setPassword("");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        if (mode === "create") {
          await createResortAccount({
            resortId,
            label,
            loginId,
            password,
            memo: memo || null,
            isPrimary,
          });
          toast.success("계정이 등록되었습니다");
        } else if (existing) {
          await updateResortAccount(existing.id, {
            resortId,
            label,
            ...(loginId ? { loginId } : {}),
            ...(password ? { password } : {}),
            memo: memo || null,
            isPrimary,
          });
          toast.success("수정되었습니다");
        }
        setOpen(false);
        reset();
      } catch (err) {
        console.error(err);
        toast.error("저장 실패");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : (
            <Button>
              <Plus className="mr-1 h-4 w-4" />
              계정 추가
            </Button>
          )
        }
      />

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "리조트 계정 추가" : "리조트 계정 수정"}</DialogTitle>
          <DialogDescription>
            ID/비밀번호는 AES-256-GCM으로 암호화되어 저장됩니다.
            {mode === "edit" && " 빈칸으로 두면 기존 값이 유지됩니다."}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="resort">리조트</Label>
            <Select
              value={resortId}
              onValueChange={(v) => v && setResortId(v)}
              disabled={mode === "edit"}
            >
              <SelectTrigger id="resort">
                <SelectValue placeholder="리조트 선택" />
              </SelectTrigger>
              <SelectContent>
                {resorts.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="label">라벨</Label>
            <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="loginId">ID{mode === "edit" && " (변경 시 입력)"}</Label>
            <Input
              id="loginId"
              autoComplete="off"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              required={mode === "create"}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">비밀번호{mode === "edit" && " (변경 시 입력)"}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="off"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required={mode === "create"}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="memo">메모</Label>
            <Input id="memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="isPrimary"
              checked={isPrimary}
              onCheckedChange={(v) => setIsPrimary(Boolean(v))}
            />
            <Label htmlFor="isPrimary" className="text-sm font-normal">
              기본 계정으로 사용
            </Label>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
