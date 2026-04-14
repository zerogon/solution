"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { theme, wordCardColors } from "@/lib/theme";

interface WordCardProps {
  word: string;
  index: number;
  isHighlighted: boolean;
  isSelected: boolean;
  isFaded: boolean;
  disabled: boolean;
  onSelect: () => void;
}

export function WordCard({
  word,
  index,
  isHighlighted,
  isSelected,
  isFaded,
  disabled,
  onSelect,
}: WordCardProps) {
  const palette = wordCardColors[index % wordCardColors.length];

  return (
    <motion.button
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "relative flex items-center justify-center rounded-2xl shadow-md text-2xl font-bold",
        "aspect-square cursor-pointer select-none min-h-[5.5rem]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-default"
      )}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        scale: isSelected ? 1.15 : isHighlighted ? 1.15 : 1,
        opacity: isFaded ? 0.3 : 1,
        backgroundColor: isSelected
          ? palette.selected
          : isHighlighted
            ? theme.secondary
            : palette.bg,
        color: isSelected ? "#ffffff" : palette.text,
        boxShadow: isHighlighted
          ? "0 0 20px rgba(124, 58, 237, 0.5), 0 0 40px rgba(124, 58, 237, 0.2)"
          : isSelected
            ? "0 0 25px rgba(124, 58, 237, 0.6)"
            : "0 1px 3px rgba(0,0,0,0.1)",
      }}
      whileHover={!disabled ? { scale: 1.07 } : undefined}
      whileTap={!disabled ? { scale: 0.95 } : undefined}
      transition={{ duration: 0.15, delay: isHighlighted ? 0 : index * 0.05 }}
    >
      {word}
    </motion.button>
  );
}
