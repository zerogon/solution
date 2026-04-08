"use client";

import { motion } from "framer-motion";
import { type Rarity, rarityConfig } from "@/lib/characters";
import { cn } from "@/lib/utils";

interface RarityBadgeProps {
  rarity: Rarity;
}

export function RarityBadge({ rarity }: RarityBadgeProps) {
  const config = rarityConfig[rarity];

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.4, type: "spring", stiffness: 300 }}
      className={cn(
        "inline-flex items-center px-4 py-1.5 rounded-full text-xl font-semibold tracking-wider",
        config.bg,
        config.color
      )}
    >
      {config.label}
    </motion.span>
  );
}
