"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { ConfirmDialogProvider } from "./ConfirmDialog";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light">
      <ConfirmDialogProvider>
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </ConfirmDialogProvider>
    </ThemeProvider>
  );
}
