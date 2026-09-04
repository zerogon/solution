"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { loginAction } from "@/actions/auth";
import { AppMark } from "@/components/app-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [rememberMe, setRememberMe] = useState(true);

  // requireActiveUser()가 비활성 계정을 여기로 보낸다. 토큰은 살아 있으니 이유를 알려준다.
  useEffect(() => {
    if (params.get("error") === "inactive") {
      toast.error("비활성화된 계정입니다. 관리자에게 문의하세요.");
    }
  }, [params]);

  function goAfterLogin() {
    const from = params.get("from") ?? "/";
    router.replace(from.startsWith("/") ? from : "/");
    router.refresh();
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("loginId", String(fd.get("loginId") ?? "").trim().toLowerCase());
    fd.set("rememberMe", rememberMe ? "true" : "false");
    startTransition(async () => {
      const res = await loginAction(undefined, fd);
      if (res.ok) goAfterLogin();
      else toast.error(res.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <div className="relative">
          <User
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="loginId"
            name="loginId"
            placeholder="아이디"
            autoComplete="username"
            autoCapitalize="none"
            aria-label="아이디"
            required
            className="h-11 pl-10 text-base"
          />
        </div>
        <div className="relative">
          <Lock
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="password"
            name="password"
            type="password"
            placeholder="비밀번호"
            autoComplete="current-password"
            aria-label="비밀번호"
            required
            className="h-11 pl-10 text-base"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          아이디와 초기 비밀번호는 관리자에게 받으세요.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="rememberMe"
          checked={rememberMe}
          onCheckedChange={(v) => setRememberMe(v === true)}
        />
        <Label htmlFor="rememberMe" className="text-sm font-normal text-muted-foreground">
          로그인 유지하기
        </Label>
      </div>
      <Button type="submit" className="h-11 w-full text-base" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            로그인 중...
          </>
        ) : (
          "로그인"
        )}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-10">
      <Card className="w-full max-w-sm rounded-2xl shadow-sm">
        <CardHeader className="items-center gap-3 px-6 pt-8 pb-2 text-center">
          <AppMark className="size-14" />
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight">Safetopia</h1>
            <p className="text-sm text-muted-foreground">카페 연차 관리</p>
          </div>
        </CardHeader>
        <CardContent className="px-6 pt-4 pb-8">
          <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-muted" />}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
