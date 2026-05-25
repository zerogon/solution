"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { changePasswordAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function PasswordPage() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success("비밀번호가 변경되었습니다.");
      router.replace("/");
      router.refresh();
    } else if (state && !state.ok) {
      toast.error(state.message);
    }
  }, [state, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>비밀번호 변경</CardTitle>
          <p className="text-sm text-muted-foreground">
            첫 로그인 시 새 비밀번호를 설정해주세요.
          </p>
        </CardHeader>
        <CardContent>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">현재 비밀번호</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">새 비밀번호</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                required
                minLength={4}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">새 비밀번호 확인</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={4}
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "변경 중..." : "변경하기"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
