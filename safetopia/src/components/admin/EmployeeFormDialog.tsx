"use client";

import { useState, useTransition, type ReactElement } from "react";
import { toast } from "sonner";
import { CheckCircle2, Copy } from "lucide-react";

import { createEmployee } from "@/actions/employees";
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
import { ROLE_LABEL } from "@/lib/labels";
import { Role } from "@/generated/prisma/enums";

export interface BranchOption {
  id: string;
  name: string;
}

export function EmployeeFormDialog({
  branches,
  trigger,
}: {
  branches: BranchOption[];
  /** 트리거 요소(보통 `<Button>`). Base UI가 여기에 트리거 props를 합친다. */
  trigger: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>(Role.EMPLOYEE);
  const [issued, setIssued] = useState<{ loginId: string; tempPassword: string; name: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const year = new Date().getUTCFullYear();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const totalRaw = String(fd.get("totalDays") ?? "").trim();
    const payload = {
      name: String(fd.get("name") ?? ""),
      loginId: String(fd.get("loginId") ?? "").toLowerCase(),
      initialPassword: String(fd.get("initialPassword") ?? ""),
      email: String(fd.get("email") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      role,
      branchId: String(fd.get("branchId") ?? ""),
      hireDate: String(fd.get("hireDate") ?? ""),
      totalDays: totalRaw === "" ? undefined : Number(totalRaw),
    };
    startTransition(async () => {
      const res = await createEmployee(payload);
      if (res.ok && res.data) {
        toast.success("직원이 등록되었습니다.");
        setIssued({ ...res.data, name: payload.name });
      } else if (!res.ok) {
        toast.error(res.message);
      }
    });
  }

  async function copyCredentials() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(`아이디: ${issued.loginId}\n초기 비밀번호: ${issued.tempPassword}`);
      toast.success("복사했습니다.");
    } catch {
      toast.error("복사에 실패했습니다. 직접 적어주세요.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setIssued(null);
        if (v) setRole(Role.EMPLOYEE);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        {issued ? (
          <div className="space-y-5">
            <DialogHeader>
              <DialogTitle>등록 완료</DialogTitle>
              <DialogDescription>
                아래 정보를 {issued.name}님에게 전달하세요. 첫 로그인 시 비밀번호 변경이 요구됩니다.
              </DialogDescription>
            </DialogHeader>
            <Alert>
              <CheckCircle2 />
              <AlertTitle>로그인 정보</AlertTitle>
              <AlertDescription>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-sm">
                  <dt className="font-sans text-muted-foreground">아이디</dt>
                  <dd>{issued.loginId}</dd>
                  <dt className="font-sans text-muted-foreground">초기 비밀번호</dt>
                  <dd>{issued.tempPassword}</dd>
                </dl>
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={copyCredentials}>
                <Copy data-icon="inline-start" />
                복사
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                닫기
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <DialogHeader>
              <DialogTitle>직원 등록</DialogTitle>
              <DialogDescription>초기 비밀번호를 비우면 자동으로 발급됩니다.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="name">이름</Label>
                  <Input id="name" name="name" required maxLength={30} autoComplete="off" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">권한</Label>
                  <NativeSelect id="role" name="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                    {Object.values(Role).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="loginId">아이디</Label>
                  <Input id="loginId" name="loginId" required minLength={3} maxLength={30} autoCapitalize="none" autoComplete="off" placeholder="영문 소문자·숫자" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="initialPassword">초기 비밀번호</Label>
                  <Input id="initialPassword" name="initialPassword" type="text" minLength={4} maxLength={64} autoComplete="off" placeholder="비우면 자동 발급" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="branchId">소속 지점{role === Role.EMPLOYEE && " *"}</Label>
                  <NativeSelect id="branchId" name="branchId" defaultValue="" required={role === Role.EMPLOYEE}>
                    <option value="">{role === Role.EMPLOYEE ? "선택" : "없음"}</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hireDate">입사일{role === Role.EMPLOYEE && " *"}</Label>
                  <Input id="hireDate" name="hireDate" type="date" required={role === Role.EMPLOYEE} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="phone">연락처</Label>
                  <Input id="phone" name="phone" inputMode="tel" maxLength={20} autoComplete="off" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">이메일</Label>
                  <Input id="email" name="email" type="email" autoComplete="off" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalDays">{year}년 연차 부여</Label>
                <Input id="totalDays" name="totalDays" type="number" step={0.5} min={0} max={60} inputMode="decimal" placeholder="비우면 나중에 부여" />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                취소
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "등록 중..." : "등록"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
