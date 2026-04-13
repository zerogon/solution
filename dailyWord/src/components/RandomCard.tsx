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
        "aspect-square cursor-pointer select-none overflow-hidden min-h-[4.5rem]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-default"
      )}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        scale: isHighlighted ? 1.15 : 1,
        opacity: isFaded ? 0.3 : 1,
        backgroundColor: isHighlighted ? theme.secondary : theme.card,
        boxShadow: isHighlighted
          ? "0 0 20px rgba(124, 58, 237, 0.5), 0 0 40px rgba(124, 58, 237, 0.2)"
          : "0 1px 3px rgba(0,0,0,0.1)",
      }}
      whileHover={!disabled ? { scale: 1.07 } : undefined}
      whileTap={!disabled ? { scale: 0.95 } : undefined}
      transition={{ duration: 0.15, delay: isHighlighted ? 0 : index * 0.05 }}
    >
      <span className="absolute text-base text-muted-foreground/70 font-semibold">
        랜덤 선택
      </span>
      <motion.span
        className="relative text-3xl font-bold text-primary drop-shadow-md"
        animate={{ scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        ?
      </motion.span>
    </motion.button>
  );
}
