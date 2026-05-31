"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { adminUpdateTeacherCredentials } from "@/actions/members";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  teacherId: string;
  currentLoginId: string;
}

export function TeacherCredentials({ teacherId, currentLoginId }: Props) {
  const [loginId, setLoginId] = useState(currentLoginId);
  const [newPassword, setNewPassword] = useState("");
  const [pending, startTransition] = useTransition();

  const loginIdChanged = loginId.trim() !== currentLoginId;
  const hasPassword = newPassword.length > 0;
  const canSave = loginIdChanged || hasPassword;

  function save() {
    if (!canSave) return;
    startTransition(async () => {
      const res = await adminUpdateTeacherCredentials({
        teacherId,
        loginId: loginIdChanged ? loginId.trim() : undefined,
        newPassword: hasPassword ? newPassword : undefined,
      });
      if (res.ok) {
        toast.success("로그인 정보가 변경되었습니다.");
        setNewPassword("");
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="teacherLoginId" className="text-xs">
            로그인 ID (숫자 8자리)
          </Label>
          <Input
            id="teacherLoginId"
            inputMode="numeric"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            className="w-44 font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="teacherNewPw" className="text-xs">
            새 비밀번호 (변경 시)
          </Label>
          <Input
            id="teacherNewPw"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="미입력 시 유지"
            className="w-44"
          />
        </div>
        <Button onClick={save} disabled={pending || !canSave}>
          {pending ? "저장 중..." : "저장"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        선생님은 로그인 시 ID와 비밀번호를 모두 입력해야 합니다.
      </p>
    </div>
  );
}
