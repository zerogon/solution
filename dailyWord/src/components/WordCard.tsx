"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { theme } from "@/lib/theme";

interface WordCardProps {
  word: string;
  isHighlighted: boolean;
  isSelected: boolean;
  isFaded: boolean;
  disabled: boolean;
  onSelect: () => void;
}

export function WordCard({
  word,
  isHighlighted,
  isSelected,
  isFaded,
  disabled,
  onSelect,
}: WordCardProps) {
  return (
    <motion.button
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "relative flex items-center justify-center rounded-xl bg-card shadow-md text-lg font-semibold",
        "aspect-square cursor-pointer select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-default"
      )}
      animate={{
        scale: isSelected ? 1.15 : isHighlighted ? 1.05 : 1,
        opacity: isFaded ? 0.2 : 1,
        backgroundColor: isSelected
          ? theme.primary
          : isHighlighted
            ? theme.secondary
            : theme.card,
        color: isSelected ? theme.card : theme.foreground,
      }}
      whileTap={!disabled ? { scale: 0.95 } : undefined}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      {word}
    </motion.button>
  );
}
