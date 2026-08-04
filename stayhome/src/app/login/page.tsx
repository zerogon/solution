"use client";

import { Suspense, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { toast } from "sonner";

import { AppMark } from "@/components/app-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
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
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <AppMark className="size-14" />
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Welfare Stay
          </h1>
          <p className="text-sm text-muted-foreground">
            사내 제휴 리조트 통합 조회 시스템
          </p>
        </div>
      </div>

      <Card className="w-full max-w-sm">
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
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
            <Button type="submit" size="lg" className="w-full" disabled={pending}>
              {pending ? "확인 중…" : "로그인"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        접근 권한이 필요하면 복지 담당자에게 문의하세요.
      </p>
    </div>
  );
}
