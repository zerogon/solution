"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BookOpen } from "lucide-react";
import { loginAction } from "./actions";
import InstallPrompt from "@/components/InstallPrompt";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export default function LoginPage() {
  const reduce = useReducedMotion();
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = async (formData: FormData) => {
    setIsPending(true);
    setError(null);
    try {
      const result = await loginAction(null, formData);
      if (result?.error) {
        setError(result.error);
      }
    } catch {
      // redirect throws, which is expected on success
    } finally {
      setIsPending(false);
    }
  };

  return (
    <>
      <InstallPrompt />
      <div className="relative mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center">
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="w-full"
        >
          {/* Mark + literary quote */}
          <div className="mb-10 text-center">
            <div className="relative mx-auto flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary/90 to-primary/70 text-primary-foreground shadow-lg shadow-primary/30 ring-1 ring-primary/20">
              <BookOpen className="relative z-10 size-5" strokeWidth={2.2} />
              <span
                aria-hidden
                className="absolute inset-0 rounded-xl bg-gradient-to-t from-transparent to-white/15"
              />
            </div>
            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-primary/80">
              Character Notebook
            </p>
            <blockquote className="mx-auto mt-4 max-w-[22rem] text-[15px] font-normal italic leading-[1.7] text-foreground/80">
              &ldquo;모든 이야기는 결국 한 사람의 이름에서 시작된다.&rdquo;
            </blockquote>
          </div>

          <Separator className="mb-8" />

          <form action={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[13px]">
                비밀번호
              </Label>
              <Input
                id="password"
                type="password"
                name="password"
                placeholder="비밀번호를 입력하세요"
                required
                autoFocus
                className="h-10"
              />
            </div>
            {error && (
              <p className="text-[13px] leading-[1.5] text-destructive">{error}</p>
            )}
            <Button
              type="submit"
              disabled={isPending}
              size="lg"
              className="w-full"
            >
              {isPending ? "확인 중..." : "들어가기"}
            </Button>
          </form>

          <p className="mt-10 text-center text-xs uppercase tracking-[0.12em] text-muted-foreground/70">
            for writers who remember names
          </p>
        </motion.div>
      </div>
    </>
  );
}
