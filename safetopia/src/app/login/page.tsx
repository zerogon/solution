"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, User } from "lucide-react";
import { toast } from "sonner";
import Image from "next/image";
import { loginAction } from "@/actions/auth";
import { LOCKUP_PX, LOCKUP_SRC } from "@/lib/brand-mark";
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
        {/* CardHeader는 flex가 아니라 grid다 — `items-center`는 세로 정렬이라 로고가
            왼쪽에 붙는다. 가로 중앙은 `justify-items-center`로 잡는다. */}
        <CardHeader className="justify-items-center px-6 pt-8 pb-2">
          {/* 브랜드명은 로고 이미지가 보여 준다. 제목 시맨틱만 남긴다.
              sr-only는 absolute라 그리드 트랙을 만들지 않는다. */}
          <h1 className="sr-only">Safetopia</h1>
          {/* 로그인은 워드마크까지 있는 전체 로고를 쓴다(셸 안에서는 엠블럼만).
              `unoptimized`는 AppMark와 같은 이유 — 서비스워커가 `/icons/` 경로로 다룬다. */}
          <Image
            src={LOCKUP_SRC}
            alt="ROASTING CAFÉ"
            width={LOCKUP_PX}
            height={LOCKUP_PX}
            unoptimized
            priority
            className="w-40"
          />
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
