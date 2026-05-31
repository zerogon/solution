"use client";

import { Suspense, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { checkLoginId, loginAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  // 비밀번호 팝업 대상 loginId (선생님/관리자). null이면 팝업 닫힘.
  const [pwTarget, setPwTarget] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  function goAfterLogin() {
    const from = params.get("from") ?? "/";
    router.replace(from);
    router.refresh();
  }

  async function signInWith(loginId: string, pw?: string) {
    const fd = new FormData();
    fd.set("loginId", loginId);
    if (pw !== undefined) fd.set("password", pw);
    const res = await loginAction(undefined, fd);
    if (res.ok) {
      goAfterLogin();
      return true;
    }
    toast.error(res.message);
    return false;
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const loginId = String(
      new FormData(e.currentTarget).get("loginId") ?? "",
    ).trim();
    if (!/^\d{8}$/.test(loginId)) {
      toast.error("휴대폰 번호 8자리(010 제외)를 입력해주세요.");
      return;
    }
    startTransition(async () => {
      const { found, needsPassword } = await checkLoginId(loginId);
      if (!found) {
        toast.error("로그인할 수 없는 ID입니다.");
        return;
      }
      if (needsPassword) {
        setPassword("");
        setPwTarget(loginId);
        return;
      }
      await signInWith(loginId);
    });
  }

  function submitPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pwTarget) return;
    startTransition(async () => {
      const ok = await signInWith(pwTarget, password);
      if (ok) setPwTarget(null);
    });
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
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
              inputMode="numeric"
              placeholder="휴대폰 번호 8자리 (010 제외)"
              autoComplete="username"
              required
              className="h-11 pl-10 text-base"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            관리자 계정: 00000000, 암호 : 0000 **임시 표시, 추후 삭제예정
          </p>
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

      <Dialog
        open={pwTarget !== null}
        onOpenChange={(open) => {
          if (!open) setPwTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>비밀번호 입력</DialogTitle>
            <DialogDescription>
              선생님·관리자 계정({pwTarget})은 비밀번호가 필요합니다.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitPassword} className="space-y-4">
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
                  required
                  className="h-11 pl-10 text-base"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setPwTarget(null)}
                disabled={pending}
              >
                취소
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "확인 중..." : "로그인"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
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
