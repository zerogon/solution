"use client";

import { motion } from "framer-motion";
import { type Character, rarityConfig } from "@/lib/characters";
import { cn } from "@/lib/utils";
import { SparkleEffect } from "./SparkleEffect";
import { RarityBadge } from "./RarityBadge";
import { CharacterLottie } from "./CharacterLottie";

interface CharacterCardProps {
  character: Character;
}

export function CharacterCard({ character }: CharacterCardProps) {
  const config = rarityConfig[character.rarity];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.3, rotateY: 180 }}
      animate={{ opacity: 1, scale: 1, rotateY: 0 }}
      transition={{
        duration: 0.6,
        type: "spring",
        stiffness: 200,
        damping: 15,
      }}
      className={cn(
        "relative flex flex-col items-center gap-2 p-4 rounded-2xl",
        config.bg,
        "shadow-lg",
        config.glow
      )}
    >
      <SparkleEffect rarity={character.rarity} />

      {/* Character Lottie animation */}
      <motion.div
        className="select-none"
        initial={{ scale: 0, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{
          delay: 0.3,
          type: "spring",
          stiffness: 400,
          damping: 10,
        }}
      >
        <CharacterLottie
          url={character.lottieUrl}
          fallbackEmoji={character.emoji}
          size={100}
        />
      </motion.div>

      {/* Name */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className={cn("text-xl font-bold", config.color)}
      >
        {character.name}
      </motion.p>

      {/* Rarity badge */}
      <RarityBadge rarity={character.rarity} />

      {/* Greeting */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="text-base text-foreground/70 text-center leading-relaxed"
      >
        &ldquo;{character.greeting}&rdquo;
      </motion.p>
    </motion.div>
  );
}
