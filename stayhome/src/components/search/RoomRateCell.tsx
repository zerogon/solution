"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

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
import { formatKrw } from "@/lib/price";
import { relativeAge } from "@/lib/freshness";
import { deleteRoomRate, setRoomRate } from "@/actions/room-rates";
import type { ManualRate } from "./manual-rates";
import type { InventoryRow } from "./types";

/**
 * 요금 칸의 **입력 장치**. 표시는 `BranchResultSection`이 하고, 이 컴포넌트는 그 옆에
 * 붙는 버튼 하나와 다이얼로그다.
 *
 * 왜 잘라 냈는가: `BranchResultSection`은 `"use client"`가 없는 순수 렌더 컴포넌트다.
 * 다이얼로그 상태를 거기 넣으면 **지점 전체가 상호작용 컴포넌트가 되고**, 한 칸을 여닫는
 * 일이 그 지점의 모든 행을 다시 그린다. 상태는 셀에 가둔다.
 *
 * 언제 보이는가:
 * - 자동 수집 요금이 있는 행 → **아무것도 안 보인다.** 사이트가 답한 값이 있으면
 *   그것이 옳고, 그 위에 사람의 기억을 덧씌울 자리를 만들지 않는다(운영자 결정).
 * - 수동 요금이 있는 행 → 금액 옆의 연필 없는 버튼(금액 자체가 트리거다).
 * - 요금이 없는 행 → `＋요금`.
 */
export function RoomRateCell({
  row,
  rate,
  nights,
  now,
  onSaved,
}: {
  row: InventoryRow;
  /** 이 행에 붙어 있는 수동 요금 원본. 없으면 새로 만든다. */
  rate: ManualRate | null;
  /** 실제로 조회된 숙박 일수. 다이얼로그가 총액 미리보기를 그리는 데 쓴다. */
  nights: number;
  /**
   * 나이를 재는 기준 시각. 호출부(`BranchResultSection`)가 정해 내려보낸다 —
   * 렌더에서 `Date.now()`를 부르면 리렌더마다 값이 흔들리고 React 컴파일러가
   * 순수성 위반으로 막는다. 이 저장소가 `now`를 prop으로 내리는 이유 그대로다.
   */
  now: number;
  /** 저장·삭제 후 호출. 호출부가 `["room-rates"]`를 무효화한다. */
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [perNight, setPerNight] = useState(rate ? String(rate.perNight) : "");
  const [note, setNote] = useState(rate?.note ?? "");
  const [pending, startTransition] = useTransition();

  // 다이얼로그를 열 때마다 서버의 현재 값으로 폼을 되돌린다. 안 하면 저장하지 않고
  // 닫았던 편집 내용이 다음에 열 때 남아 "이미 그렇게 저장돼 있다"처럼 읽힌다.
  function onOpenChange(next: boolean) {
    if (next) {
      setPerNight(rate ? String(rate.perNight) : "");
      setNote(rate?.note ?? "");
    }
    setOpen(next);
  }

  const parsed = Number(perNight.replace(/[,\s]/g, ""));
  const previewable = Number.isFinite(parsed) && parsed > 0;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await setRoomRate({
          resortSlug: row.resortSlug,
          branchName: row.branchName,
          roomType: row.roomType,
          perNight: perNight.replace(/[,\s]/g, ""),
          note: note.trim() || null,
        });
        toast.success(`${row.roomType} — 1박 ${formatKrw(parsed)} 저장됨`);
        setOpen(false);
        onSaved();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장에 실패했습니다");
      }
    });
  }

  function onDelete() {
    startTransition(async () => {
      try {
        await deleteRoomRate({
          resortSlug: row.resortSlug,
          branchName: row.branchName,
          roomType: row.roomType,
        });
        toast.success(`${row.roomType} 요금 삭제됨`);
        setOpen(false);
        onSaved();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제에 실패했습니다");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-1.5 text-muted-foreground"
            title={
              rate
                ? `수동 입력 요금 수정 (${relativeAge(rate.updatedAt, now)} 입력)`
                : "이 객실의 1박 단가를 직접 입력합니다"
            }
          >
            {/* `＋`는 "없는 것을 만든다"는 뜻이라 수정에는 쓰지 않는다. */}
            {rate ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}
            {/* 좁은 화면에서는 아이콘만 남긴다 — 이 저장소의 관용구. */}
            <span className="sr-only sm:not-sr-only sm:text-[11px]">
              {rate ? "수정" : "요금"}
            </span>
          </Button>
        }
      />
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{row.roomType}</DialogTitle>
            <DialogDescription>
              {row.resortName} · {row.branchName}
              <br />
              사이트가 요금을 주지 않는 객실입니다. 여기 넣은 <b>1박 단가</b>는 이 객실의
              모든 날짜·박수 조회에 쓰이고, 화면은 <b>수동 입력</b>이라고 표시합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="rate-per-night">1박 단가 (원)</Label>
              <Input
                id="rate-per-night"
                inputMode="numeric"
                autoComplete="off"
                value={perNight}
                onChange={(e) => setPerNight(e.target.value)}
                placeholder="예: 170000"
                className="font-mono tabular-nums"
              />
              {/*
                총액이 아니라 단가를 받는다는 것을 화면이 직접 말한다. 이 칸에 숙박 총액을
                넣는 것이 가장 그럴듯한 오류이고, 그러면 조용히 N배 틀린 금액이 발행된다.
              */}
              <p className="text-xs text-muted-foreground">
                {previewable && nights > 1 ? (
                  <>
                    조회한 {nights}박 기준{" "}
                    <span className="font-mono tabular-nums font-medium text-foreground">
                      {formatKrw(parsed * nights)}
                    </span>
                    로 표시됩니다 (단가 × 박수).
                  </>
                ) : (
                  <>숙박 총액이 아니라 하룻밤 값입니다. 박수는 화면이 곱합니다.</>
                )}
              </p>
              {/*
                요일·시즌 축이 없다는 사실을 숨기지 않는다. 실제 요금표는 금·토가 더 비싸고
                (오크밸리 힐스 25평 수 69,000 / 금 90,000 / 토 104,000), 이 기능은 그 차이를
                담지 못한다. 담당자가 어느 기준으로 넣었는지는 아래 근거 칸이 기억한다.
              */}
              <p className="text-xs text-muted-foreground">
                요일·성수기 구분은 담기지 않습니다 — 주중 기준 등 하나를 정해 넣으세요.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate-note">근거 (선택)</Label>
              <Input
                id="rate-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="예: 2026 요금표 비수기 주중 · 오션뷰 기준"
              />
              {/*
                평문이고 `/admin/rates`에 마스킹 없이 그려진다. `ResortAccount.memo`가
                한화 회원권 비밀번호를 담게 된 전례가 있어 placeholder가 무엇을 적는
                자리인지 직접 말한다 — `ExcludePropertyDialog`의 `reason`과 같은 이유.
              */}
              <p className="text-xs text-muted-foreground">
                관리 화면에 그대로 표시됩니다. 비밀번호 등 자격증명은 적지 마세요.
              </p>
            </div>

            {rate && (
              <p className="text-xs text-muted-foreground">
                마지막 입력 {relativeAge(rate.updatedAt, now)} · 현재 1박{" "}
                <span className="font-mono tabular-nums">{formatKrw(rate.perNight)}</span>
              </p>
            )}
          </div>

          <DialogFooter>
            {/*
              삭제는 파괴적이지만 복구가 "다시 입력" 한 번이라 확인 단계를 두지 않는다 —
              확인의 무게를 결과에 맞춘다(`ExcludePropertyDialog`의 판단과 같다).
            */}
            {rate && (
              <Button
                type="button"
                variant="ghost"
                onClick={onDelete}
                disabled={pending}
                className="mr-auto text-destructive"
              >
                <Trash2 className="size-3.5" />
                삭제
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              취소
            </Button>
            <Button type="submit" disabled={pending || !previewable}>
              {pending ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
