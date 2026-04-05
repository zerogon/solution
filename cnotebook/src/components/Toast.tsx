"use client";

// Compatibility shim: call sites use `useToast().toast(message, type)`.
// Internally we delegate to sonner's `toast()` (wrapped by shadcn's Toaster
// mounted in Providers.tsx).
import { toast as sonnerToast } from "sonner";
import { useCallback } from "react";

type ToastType = "success" | "error" | "info";

export function ToastProvider({ children }: { children: React.ReactNode }) {
  // Toaster is now mounted inside Providers; this Provider is a no-op
  // kept for backwards compatibility.
  return <>{children}</>;
}

export function useToast() {
  const toast = useCallback((message: string, type: ToastType = "info") => {
    if (type === "success") {
      sonnerToast.success(message);
    } else if (type === "error") {
      sonnerToast.error(message);
    } else {
      sonnerToast(message);
    }
  }, []);

  return { toast };
}
