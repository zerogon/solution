"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const from = search.get("from");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await signIn("credentials", {
        loginId,
        password,
        redirect: false,
      });
      if (res?.error) {
        toast.error("로그인에 실패했습니다");
        return;
      }
      router.push(from && from.startsWith("/") ? from : "/");
      router.refresh();
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Welfare Stay</CardTitle>
          <CardDescription>사내 제휴 리조트 통합 조회 시스템</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-3" onSubmit={onSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="loginId">ID</Label>
              <Input
                id="loginId"
                autoComplete="username"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">비밀번호</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "확인 중…" : "로그인"}
            </Button>
            <p className="text-xs text-muted-foreground">
              테스트 계정: admin / 0000
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
