"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-600">
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
          <h2 className="mt-4 text-xl font-bold text-surface-800">
            Character Notebook
          </h2>
          <p className="mt-1 text-sm text-surface-400">
            비밀번호를 입력하여 접속하세요
          </p>
        </div>
        <form action={formAction} className="space-y-4">
          <input
            type="password"
            name="password"
            placeholder="비밀번호를 입력하세요"
            required
            autoFocus
            className="w-full rounded-xl border border-surface-300 bg-card px-4 py-2.5 text-sm text-surface-800 placeholder:text-surface-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
          {state?.error && (
            <p className="text-sm text-danger-500">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={isPending}
            className="w-full rounded-xl bg-primary-600 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
          >
            {isPending ? "확인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
