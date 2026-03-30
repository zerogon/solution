"use client";

import { ThemeProvider } from "next-themes";
import { ToastProvider } from "./Toast";
import { ConfirmDialogProvider } from "./ConfirmDialog";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light">
      <ToastProvider>
        <ConfirmDialogProvider>
          {children}
        </ConfirmDialogProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
