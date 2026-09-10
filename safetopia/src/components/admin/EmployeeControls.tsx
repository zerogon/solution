"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KeyRound, Trash2, TriangleAlert } from "lucide-react";

import { changeEmployeeStatus, deleteEmployee, resetEmployeePassword } from "@/actions/employees";
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
import { DEFAULT_PASSWORD } from "@/lib/passwords";
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

export function ResetPasswordButton({ userId, userName }: { userId: string; userName: string }) {
  const [issued, setIssued] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (!window.confirm(`${userName}님의 비밀번호를 ${DEFAULT_PASSWORD}(으)로 초기화할까요?`)) return;
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
          <AlertTitle>초기 비밀번호</AlertTitle>
          <AlertDescription>
            <span className="font-mono text-base">{issued}</span> — 직원에게 전달하세요. 첫 로그인 시 변경이 요구됩니다.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/**
 * 완전 삭제. 퇴사 처리와 헷갈리면 안 되는 동작이라 이름을 그대로 받아 적게 한다 —
 * 목록에서 지나가다 누를 수 있는 자리에는 두지 않고 상세 화면에만 있다.
 */
export function DeleteEmployeeDialog({
  userId,
  userName,
  isSelf,
}: {
  userId: string;
  userName: string;
  isSelf: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    startTransition(async () => {
      const res = await deleteEmployee({ id: userId });
      if (res.ok) {
        setOpen(false);
        toast.success(`${userName}님을 삭제했습니다.`);
        router.replace("/admin/employees");
        // 지운 사람이 목록에 남아 보이지 않도록 라우터 캐시까지 비운다.
        router.refresh();
      } else toast.error(res.message);
    });
  }

  if (isSelf) {
    return (
      <Button variant="destructive" size="sm" disabled>
        <Trash2 data-icon="inline-start" />
        직원 삭제
      </Button>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setTyped("");
      }}
    >
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        <Trash2 data-icon="inline-start" />
        직원 삭제
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>직원 삭제</DialogTitle>
            <DialogDescription>되돌릴 수 없습니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert variant="warning">
              <TriangleAlert />
              <AlertTitle>{userName}님의 기록이 모두 사라집니다</AlertTitle>
              <AlertDescription>
                연차 신청 내역·잔액·조정 이력이 함께 영구 삭제되고 캘린더에서도 빠집니다. 기록을 남겨야 한다면
                삭제 대신 재직 상태를 &lsquo;퇴사&rsquo;로 바꾸세요.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="confirmName">확인을 위해 직원 이름을 그대로 입력하세요</Label>
              <Input
                id="confirmName"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                placeholder={userName}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              취소
            </Button>
            <Button type="submit" variant="destructive" disabled={pending || typed.trim() !== userName}>
              {pending ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
