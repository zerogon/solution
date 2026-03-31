"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { theme } from "@/lib/theme";

interface RandomCardProps {
  index: number;
  isHighlighted: boolean;
  isFaded: boolean;
  disabled: boolean;
  onSelect: () => void;
}

export function RandomCard({
  index,
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
        "relative flex items-center justify-center rounded-2xl bg-card shadow-md",
        "aspect-square cursor-pointer select-none overflow-hidden min-h-[5.5rem]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-default"
      )}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        scale: isHighlighted ? 1.08 : 1,
        opacity: isFaded ? 0.3 : 1,
        backgroundColor: isHighlighted ? theme.secondary : theme.card,
      }}
      whileHover={!disabled ? { scale: 1.07 } : undefined}
      whileTap={!disabled ? { scale: 0.95 } : undefined}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <span className="absolute text-xs text-muted-foreground/50 font-medium">
        랜덤 선택
      </span>
      <motion.span
        className="relative text-2xl font-bold text-primary"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        ?
      </motion.span>
    </motion.button>
  );
}
