"use client";

import { Suspense, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, User } from "lucide-react";
import { toast } from "sonner";
import { checkLoginId, loginAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [rememberMe, setRememberMe] = useState(true);

  function goAfterLogin() {
    const from = params.get("from") ?? "/";
    router.replace(from);
    router.refresh();
  }

  async function signInWith(loginId: string, pw?: string) {
    const fd = new FormData();
    fd.set("loginId", loginId);
    if (pw !== undefined) fd.set("password", pw);
    fd.set("rememberMe", rememberMe ? "true" : "false");
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
