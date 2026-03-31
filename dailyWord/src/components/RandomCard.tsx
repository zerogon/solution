"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { theme } from "@/lib/theme";

interface RandomCardProps {
  isHighlighted: boolean;
  isFaded: boolean;
  disabled: boolean;
  onSelect: () => void;
}

export function RandomCard({
  isHighlighted,
  isFaded,
  disabled,
  onSelect,
}: RandomCardProps) {
  return (
    <motion.button
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "relative flex items-center justify-center rounded-xl bg-card shadow-md",
        "aspect-square cursor-pointer select-none overflow-hidden",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-default"
      )}
      animate={{
        scale: isHighlighted ? 1.05 : 1,
        opacity: isFaded ? 0.2 : 1,
        backgroundColor: isHighlighted ? theme.secondary : theme.card,
      }}
      whileTap={!disabled ? { scale: 0.95 } : undefined}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <span className="absolute text-xs text-muted-foreground/50 font-medium">
        랜덤 선택
      </span>
      <span className="relative text-2xl font-bold text-primary">?</span>
    </motion.button>
  );
}
