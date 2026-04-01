"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { theme, wordCardColors } from "@/lib/theme";
import { FLIP_DURATION } from "@/lib/constants";
import type { MemoryCard as MemoryCardType } from "@/lib/gameUtils";

interface MemoryCardProps {
  card: MemoryCardType;
  isFaceUp: boolean;
  isMatched: boolean;
  disabled: boolean;
  onFlip: () => void;
}

export function MemoryCard({
  card,
  isFaceUp,
  isMatched,
  disabled,
  onFlip,
}: MemoryCardProps) {
  const palette = wordCardColors[card.paletteIndex % wordCardColors.length];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: card.cardId * 0.04 }}
      style={{ perspective: "800px" }}
      className="aspect-square"
    >
      <motion.button
        onClick={onFlip}
        disabled={disabled || isFaceUp || isMatched}
        animate={{
          rotateY: isFaceUp || isMatched ? 0 : 180,
          scale: isMatched ? [1, 1.1, 1] : 1,
        }}
        transition={{
          rotateY: { duration: FLIP_DURATION, ease: "easeInOut" },
          scale: { duration: 0.4, ease: "easeOut" },
        }}
        className={cn(
          "relative w-full h-full cursor-pointer select-none rounded-2xl",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-default"
        )}
        style={{ transformStyle: "preserve-3d" }}
      >
        {/* Front face */}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-2xl",
            "text-xl font-bold shadow-md"
          )}
          style={{
            backfaceVisibility: "hidden",
            backgroundColor: isMatched ? palette.selected : palette.bg,
            color: isMatched ? "#ffffff" : palette.text,
          }}
        >
          {card.word}
        </div>

        {/* Back face */}
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-2xl",
            "text-2xl font-bold shadow-md"
          )}
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            backgroundColor: theme.primary,
            color: "#ffffff",
          }}
        >
          ?
        </div>
      </motion.button>
    </motion.div>
  );
}
