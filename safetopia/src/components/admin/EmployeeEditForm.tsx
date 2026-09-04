"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { updateEmployee } from "@/actions/employees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ROLE_LABEL } from "@/lib/labels";
import { Role } from "@/generated/prisma/enums";

export function EmployeeEditForm({
  user,
}: {
  user: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    role: Role;
    branchId: string | null;
    hireDate: string | null;
    isSelf: boolean;
  };
}) {
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateEmployee({
        id: user.id,
        name: String(fd.get("name") ?? ""),
        email: String(fd.get("email") ?? ""),
        phone: String(fd.get("phone") ?? ""),
        role: String(fd.get("role") ?? user.role),
        branchId: user.branchId ?? "",
        hireDate: String(fd.get("hireDate") ?? ""),
      });
      if (res.ok) toast.success("저장되었습니다.");
      else toast.error(res.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">이름</Label>
          <Input id="name" name="name" defaultValue={user.name} required maxLength={30} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="role">권한</Label>
          {/* 자기 자신의 권한은 여기서 못 바꾼다 — 잠금 사고 방지. */}
          <NativeSelect id="role" name="role" defaultValue={user.role} disabled={user.isSelf}>
            {Object.values(Role).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="hireDate">입사일</Label>
          <Input id="hireDate" name="hireDate" type="date" defaultValue={user.hireDate ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">연락처</Label>
          <Input id="phone" name="phone" defaultValue={user.phone ?? ""} inputMode="tel" maxLength={20} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="email">이메일</Label>
          <Input id="email" name="email" type="email" defaultValue={user.email ?? ""} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "저장 중..." : "저장"}
        </Button>
      </div>
    </form>
  );
}
