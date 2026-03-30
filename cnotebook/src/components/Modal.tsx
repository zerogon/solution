"use client";

import { useEffect, useRef } from "react";
import { XIcon } from "./Icons";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md";
}

export default function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const maxWidth = size === "sm" ? "max-w-sm" : "max-w-md";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`w-full ${maxWidth} mx-4 rounded-2xl bg-card p-6 shadow-modal animate-slide-up`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-surface-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-surface-400 transition-colors hover:bg-surface-100 hover:text-surface-600"
          >
            <XIcon size={20} />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
