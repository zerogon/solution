"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EyeOff } from "lucide-react";

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
import { excludeProperty } from "@/actions/properties";
import type { PropertyRow } from "./PropertyTable";

/**
 * 제외는 확인을 거치고 복구는 거치지 않는다 — 확인의 무게를 결과에 맞춘다.
 * 제외는 `resort_inventory` 행을 지우고(되돌릴 수 없다), 복구는 아무것도 만들지 않는다.
 *
 * 그래서 스위치가 아니라 다이얼로그다. 스위치는 값싼 대칭 토글을 뜻하는데 이 동작은
 * 그렇지 않고, 무엇이 지워지는지를 **실제 숫자로** 먼저 말해야 한다.
 */
export function ExcludePropertyDialog({
  resortId,
  resortName,
  property,
}: {
  resortId: string;
  resortName: string;
  property: PropertyRow;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const { deletedRows } = await excludeProperty({
          resortId,
          branchName: property.branchName,
          reason: reason.trim() || null,
        });
        toast.success(
          `${property.label} 제외됨 — 재고 ${deletedRows.toLocaleString()}행 삭제`,
        );
        setReason("");
        setOpen(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "제외에 실패했습니다");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" title="조회·수집에서 제외">
            <EyeOff className="size-3.5" />
            <span className="sr-only sm:not-sr-only">제외</span>
          </Button>
        }
      />
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {resortName} · {property.label} 제외
            </DialogTitle>
            <DialogDescription>
              조회 화면에서 사라지고 정기 수집에서도 빠집니다. 이미 수집된 재고{" "}
              <span className="font-mono tabular-nums font-medium text-foreground">
                {property.inventoryRows.toLocaleString()}
              </span>
              행이 즉시 삭제되며, 되살려도 다음 수집 전까지는 비어 있습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-4">
            <Label htmlFor="exclusion-reason">사유 (선택)</Label>
            <Input
              id="exclusion-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              placeholder="예: 제휴 없음 · 계약 만료"
            />
            {/*
              이 칸은 암호화되지 않고 아래 표에 마스킹 없이 그려진다.
              `ResortAccount.memo`가 한화 회원권 비밀번호를 담게 된 전례가 있어,
              무엇을 적는 자리인지를 placeholder가 직접 말한다.
            */}
            <p className="text-xs text-muted-foreground">
              표에 그대로 표시됩니다. 비밀번호 등 자격증명은 적지 마세요.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              취소
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "제외 중…" : "제외"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
