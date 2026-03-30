"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { XIcon, CheckIcon } from "./Icons";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-slide-up flex items-center gap-3 rounded-xl px-4 py-3 shadow-card-hover ${
              t.type === "success"
                ? "bg-success-600 text-white"
                : t.type === "error"
                  ? "bg-danger-600 text-white"
                  : "bg-tooltip text-white"
            }`}
          >
            {t.type === "success" && <CheckIcon size={18} />}
            <span className="text-sm font-medium">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="ml-2 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
            >
              <XIcon size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
