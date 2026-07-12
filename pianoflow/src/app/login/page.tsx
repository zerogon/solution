"use client";

import { Suspense, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { loginAction } from "@/actions/auth";
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

  function goAfterLogin() {
    const from = params.get("from") ?? "/";
    router.replace(from);
    router.refresh();
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const loginId = String(fd.get("loginId") ?? "").trim();
    if (!/^\d{8}$/.test(loginId)) {
      toast.error("휴대폰 번호 8자리(010 제외)를 입력해주세요.");
      return;
    }
    fd.set("loginId", loginId);
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
            inputMode="numeric"
            placeholder="휴대폰 번호 8자리 (010 제외)"
            autoComplete="username"
            aria-label="로그인 ID"
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
          초기 비밀번호는 휴대폰 번호 뒤 4자리입니다.
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
        <CardHeader className="px-6 pt-8 pb-2">
          <Image
            src="/web-logo.png"
            alt="art'i Piano"
            width={416}
            height={103}
            priority
            // mix-blend-multiply: 로고의 흰 배경을 카드 색에 녹여 흰 박스 제거
            className="mx-auto h-auto w-56 mix-blend-multiply"
          />
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
