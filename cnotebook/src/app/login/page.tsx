"use client";

import { useState } from "react";
import { loginAction } from "./actions";

export default function LoginPage() {
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
    <div className="relative flex min-h-[65vh] items-center justify-center">
      {/* Decorative background elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-80 w-80 rounded-full bg-primary-200/15 blur-3xl animate-float" />
        <div className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-primary-300/10 blur-3xl animate-float" style={{ animationDelay: '-3s' }} />
        <div className="absolute top-1/4 right-1/4 h-40 w-40 rounded-full bg-primary-100/20 blur-2xl animate-float" style={{ animationDelay: '-1.5s' }} />
      </div>

      <div className="relative z-10 w-full max-w-sm animate-slide-up">
        <div className="rounded-2xl border border-surface-200/80 bg-card/80 p-8 shadow-card-lg backdrop-blur-sm">
          {/* Logo */}
          <div className="mb-10 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/20">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
              </svg>
            </div>
            <h2 className="mt-5 text-xl font-bold text-surface-900 sm:text-2xl">
              Character Notebook
            </h2>
            <p className="mt-1.5 text-sm text-surface-400">
              비밀번호를 입력하여 접속하세요
            </p>
          </div>

          <form action={handleSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                name="password"
                placeholder="비밀번호를 입력하세요"
                required
                autoFocus
                className="w-full rounded-xl border border-surface-200 bg-surface-50/80 px-4 py-3 text-sm text-surface-800 shadow-inner-soft transition-all duration-200 placeholder:text-surface-400 focus:border-primary-400 focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary-200/50"
              />
            </div>
            {error && (
              <p className="text-sm text-danger-500">{error}</p>
            )}
            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:shadow-md hover:shadow-primary-500/20 active:scale-[0.98] disabled:opacity-50"
            >
              {isPending ? "확인 중..." : "로그인"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
