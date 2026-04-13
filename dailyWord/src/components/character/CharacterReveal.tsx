"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { type Character, characters, pickRandomCharacter } from "@/lib/characters";
import { CharacterCard } from "./CharacterCard";

interface CharacterRevealProps {
  /** If provided, skip the slot-machine animation and show this character directly */
  instant?: boolean;
}

export function CharacterReveal({ instant }: CharacterRevealProps) {
  const [phase, setPhase] = useState<"rolling" | "revealed">(
    instant ? "revealed" : "rolling"
  );
  const [displayEmoji, setDisplayEmoji] = useState(characters[0].emoji);
  const [character, setCharacter] = useState<Character | null>(
    instant ? pickRandomCharacter() : null
  );

  const reveal = useCallback(() => {
    const picked = pickRandomCharacter();
    setCharacter(picked);

    // Slot-machine effect: rapidly cycle through emojis
    let tick = 0;
    const totalTicks = 12;
    const interval = setInterval(() => {
      tick++;
      const randomChar = characters[Math.floor(Math.random() * characters.length)];
      setDisplayEmoji(randomChar.emoji);

      if (tick >= totalTicks) {
        clearInterval(interval);
        setDisplayEmoji(picked.emoji);
        // Small pause before revealing
        setTimeout(() => setPhase("revealed"), 200);
      }
    }, 80);
  }, []);

  useEffect(() => {
    if (!instant) {
      // Start rolling after a brief delay
      const timer = setTimeout(reveal, 300);
      return () => clearTimeout(timer);
    }
  }, [instant, reveal]);

  return (
    <div className="w-full">
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="text-base text-muted-foreground mb-2 text-center"
      >
        오늘의 캐릭터
      </motion.p>

      <AnimatePresence mode="wait">
        {phase === "rolling" ? (
          <motion.div
            key="rolling"
            exit={{ opacity: 0, scale: 0.8, rotateY: 90 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-2 py-4"
          >
            <motion.span
              className="text-4xl select-none inline-block"
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 0.16, repeat: Infinity }}
            >
              {displayEmoji}
            </motion.span>
            <span className="text-base text-muted-foreground animate-pulse">
              뽑는 중...
            </span>
          </motion.div>
        ) : character ? (
          <motion.div
            key="revealed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <CharacterCard character={character} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
