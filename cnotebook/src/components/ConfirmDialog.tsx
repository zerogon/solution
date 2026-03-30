"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts);
    return new Promise((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = () => {
    resolveRef.current?.(true);
    setOptions(null);
  };

  const handleCancel = () => {
    resolveRef.current?.(false);
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {options && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay backdrop-blur-sm animate-fade-in"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCancel();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") handleCancel();
          }}
        >
          <div className="w-full max-w-sm mx-4 rounded-2xl bg-card p-6 shadow-modal animate-slide-up">
            <h3 className="text-lg font-bold text-surface-900">{options.title}</h3>
            <p className="mt-2 text-sm text-surface-600">{options.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={handleCancel}
                className="rounded-lg px-4 py-2 text-sm font-medium text-surface-600 transition-colors hover:bg-surface-100"
              >
                {options.cancelLabel || "취소"}
              </button>
              <button
                onClick={handleConfirm}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                  options.variant === "danger"
                    ? "bg-danger-500 hover:bg-danger-600"
                    : "bg-primary-600 hover:bg-primary-700"
                }`}
              >
                {options.confirmLabel || "확인"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmDialogProvider");
  return ctx;
}
