"use client";

import { motion } from "framer-motion";
import { type Rarity } from "@/lib/characters";

const particleColors: Record<Rarity, string[]> = {
  common: ["#7dd3fc", "#38bdf8", "#bae6fd"],
  rare: ["#c084fc", "#a855f7", "#e9d5ff", "#f472b6"],
  legendary: ["#fbbf24", "#f59e0b", "#fde68a", "#fb923c", "#ef4444"],
};

interface SparkleEffectProps {
  rarity: Rarity;
  count?: number;
}

export function SparkleEffect({ rarity, count }: SparkleEffectProps) {
  const colors = particleColors[rarity];
  const particleCount = count ?? (rarity === "legendary" ? 16 : rarity === "rare" ? 10 : 6);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: particleCount }).map((_, i) => {
        const angle = (360 / particleCount) * i;
        const distance = 60 + Math.random() * 40;
        const x = Math.cos((angle * Math.PI) / 180) * distance;
        const y = Math.sin((angle * Math.PI) / 180) * distance;
        const color = colors[i % colors.length];
        const size = 4 + Math.random() * 6;

        return (
          <motion.div
            key={i}
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: size,
              height: size,
              backgroundColor: color,
              marginLeft: -size / 2,
              marginTop: -size / 2,
            }}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
            animate={{
              opacity: [0, 1, 1, 0],
              x: [0, x * 0.6, x],
              y: [0, y * 0.6, y],
              scale: [0, 1.2, 0],
            }}
            transition={{
              duration: 0.8,
              delay: 0.1 + i * 0.03,
              ease: "easeOut",
            }}
          />
        );
      })}
    </div>
  );
}
