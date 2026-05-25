"use client";

import { Suspense, useActionState, useEffect } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { loginAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, formAction, pending] = useActionState(loginAction, undefined);

  useEffect(() => {
    if (state?.ok) {
      const from = params.get("from") ?? "/";
      router.replace(from);
      router.refresh();
    } else if (state && !state.ok) {
      toast.error(state.message);
    }
  }, [state, router, params]);

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="loginId">로그인 ID</Label>
        <div className="relative">
          <User
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="loginId"
            name="loginId"
            placeholder="휴대폰 뒷4자리 (암호동일)"
            autoComplete="username"
            required
            className="h-11 pl-10 text-base"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">비밀번호</Label>
        <div className="relative">
          <Lock
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="h-11 pl-10 text-base"
          />
        </div>
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
    <div className="relative flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="relative">
          <div
            aria-hidden
            className="absolute inset-0 rounded-3xl bg-foreground/5 blur-2xl"
          />
          <Image
            src="/icons/icon-192.png"
            alt="PianoFlow 로고"
            width={112}
            height={112}
            priority
            className="relative size-28 rounded-3xl bg-card shadow-2xl shadow-black/10 ring-4 ring-background dark:shadow-black/40 dark:ring-card"
          />
        </div>

        <Card className="w-full rounded-3xl bg-card shadow-xl shadow-black/5 ring-1 ring-border dark:shadow-black/40">
          <CardHeader className="items-center gap-1 pt-6 pb-2 text-center">
            <CardTitle className="text-3xl">PianoFlow</CardTitle>
            <p className="text-sm text-muted-foreground">피아노 학원 레슨 예약</p>
          </CardHeader>
          <CardContent className="px-6 pt-2 pb-6">
            <Suspense fallback={<div className="h-40 animate-pulse rounded-md bg-muted" />}>
              <LoginForm />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
