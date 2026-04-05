"use client";

// Compatibility shim: existing call sites use
//   <Modal open={...} onClose={...} title="...">{children}</Modal>
// Internally we delegate to shadcn's Dialog (Base UI under the hood).
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md";
}

export default function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        className={cn(
          "sm:max-w-md",
          size === "sm" && "sm:max-w-sm"
        )}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="mt-1">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
