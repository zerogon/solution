"use client";

import { Suspense, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { loginAction } from "@/actions/auth";
import { AppMark } from "@/components/app-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PwaInstallPrompt } from "@/components/pwa/PwaInstallPrompt";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [rememberMe, setRememberMe] = useState(true);

  function goAfterLogin() {
    const from = params.get("from") ?? "/";
    router.replace(from.startsWith("/") ? from : "/");
    router.refresh();
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
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
            autoFocus
            required
            className="h-11 pl-10 text-base"
          />
        </div>
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
        {/* CardHeader는 flex가 아니라 grid다 — `items-center`는 세로 정렬이라 로고가
            왼쪽에 붙는다. 가로 중앙은 `justify-items-center`로 잡는다. */}
        <CardHeader className="justify-items-center gap-3 px-6 pt-8 pb-2">
          <AppMark className="size-16" />
          <div className="text-center">
            <h1 className="font-heading text-xl font-semibold tracking-tight">Sulki Holiday</h1>
            <p className="text-sm text-muted-foreground">내 연차 관리</p>
          </div>
        </CardHeader>
        <CardContent className="px-6 pt-4 pb-8">
          <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-muted" />}>
            <LoginForm />
            {/* 링크로 들어온 첫 화면이 여기다 — 설치 안내는 로그인 전에 떠야 한다.
                루트 레이아웃이 아니라 이 Suspense 경계 **안**에 두는 이유: 시트(Base UI
                모달)는 열리는 순간 바깥 형제에 aria-hidden을 직접 찍는데, 위 경계가
                하이드레이트되기 전에 그러면 mismatch가 난다. 같은 경계 안이면 경계가
                커밋된 뒤에야 effect가 돈다. 로그인 뒤 셸에도 마운트되지만 세션 1회
                가드가 중복을 막는다. */}
            <PwaInstallPrompt />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
