"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRightLeft, KeyRound } from "lucide-react";

import { changeEmployeeBranch, changeEmployeeStatus, resetEmployeePassword } from "@/actions/employees";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { EMPLOYEE_STATUS_LABEL } from "@/lib/labels";
import { EmployeeStatus } from "@/generated/prisma/enums";

/** 재직 상태 셀렉트 — 바꾸는 즉시 적용(확인 창 한 번). */
export function EmployeeStatusSelect({ id, status, isSelf }: { id: string; status: EmployeeStatus; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as EmployeeStatus;
    if (next === status) return;
    if (next !== EmployeeStatus.ACTIVE && !window.confirm(`${EMPLOYEE_STATUS_LABEL[next]} 처리하면 로그인이 차단됩니다. 계속할까요?`)) {
      e.target.value = status;
      return;
    }
    startTransition(async () => {
      const res = await changeEmployeeStatus({ id, status: next });
      if (res.ok) toast.success(`재직 상태를 '${EMPLOYEE_STATUS_LABEL[next]}'(으)로 변경했습니다.`);
      else {
        toast.error(res.message);
        e.target.value = status;
      }
    });
  }

  return (
    <NativeSelect defaultValue={status} onChange={onChange} disabled={pending || isSelf} aria-label="재직 상태">
      {Object.values(EmployeeStatus).map((s) => (
        <option key={s} value={s}>
          {EMPLOYEE_STATUS_LABEL[s]}
        </option>
      ))}
    </NativeSelect>
  );
}

export function BranchChangeDialog({
  userId,
  currentBranchId,
  branches,
}: {
  userId: string;
  currentBranchId: string | null;
  branches: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await changeEmployeeBranch({
        id: userId,
        toBranchId: String(fd.get("toBranchId") ?? ""),
        reason: String(fd.get("reason") ?? ""),
      });
      if (res.ok) {
        toast.success("지점을 이동했습니다.");
        setOpen(false);
      } else toast.error(res.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <ArrowRightLeft data-icon="inline-start" />
        지점 이동
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>지점 이동</DialogTitle>
            <DialogDescription>이동 이력이 기록됩니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="toBranchId">이동할 지점</Label>
              <NativeSelect id="toBranchId" name="toBranchId" required defaultValue="">
                <option value="">선택</option>
                {branches
                  .filter((b) => b.id !== currentBranchId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">사유</Label>
              <Input id="reason" name="reason" maxLength={200} placeholder="선택" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              취소
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "이동 중..." : "이동"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ResetPasswordButton({ userId, userName }: { userId: string; userName: string }) {
  const [issued, setIssued] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (!window.confirm(`${userName}님의 비밀번호를 초기화할까요? 새 임시 비밀번호가 발급됩니다.`)) return;
    startTransition(async () => {
      const res = await resetEmployeePassword({ id: userId });
      if (res.ok && res.data) {
        setIssued(res.data.tempPassword);
        toast.success("비밀번호를 초기화했습니다.");
      } else if (!res.ok) toast.error(res.message);
    });
  }

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={run} disabled={pending}>
        <KeyRound data-icon="inline-start" />
        비밀번호 초기화
      </Button>
      {issued && (
        <Alert variant="warning">
          <KeyRound />
          <AlertTitle>임시 비밀번호</AlertTitle>
          <AlertDescription>
            <span className="font-mono text-base">{issued}</span> — 이 창을 닫으면 다시 볼 수 없습니다. 첫 로그인 시 변경이 요구됩니다.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
