"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";

import { changePasswordAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      toast.success("비밀번호를 바꿨습니다.");
      formRef.current?.reset();
    } else if (state && !state.ok) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="max-w-xs space-y-4">
      <div className="space-y-2">
        <Label htmlFor="currentPassword">현재 비밀번호</Label>
        <Input id="currentPassword" name="currentPassword" type="password" required autoComplete="current-password" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="newPassword">새 비밀번호</Label>
        <Input id="newPassword" name="newPassword" type="password" required minLength={4} autoComplete="new-password" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">새 비밀번호 확인</Label>
        <Input id="confirmPassword" name="confirmPassword" type="password" required minLength={4} autoComplete="new-password" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "바꾸는 중..." : "비밀번호 변경"}
      </Button>
    </form>
  );
}
