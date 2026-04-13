"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { getTodaySentence, getTodayDateKST } from "@/lib/daily-sentences";


interface Particle {
  id: number;
  left: number;
  size: number;
  duration: number;
  delay: number;
  opacity: number;
}

function FloatingParticles() {
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        id: i,
        left: 5 + Math.random() * 90,
        size: 3 + Math.random() * 4,
        duration: 4 + Math.random() * 3,
        delay: Math.random() * 4,
        opacity: 0.15 + Math.random() * 0.25,
      })),
    []
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-primary"
          style={{
            left: `${p.left}%`,
            bottom: "-10px",
            width: p.size,
            height: p.size,
          }}
          animate={{
            y: [0, -400 - Math.random() * 200],
            opacity: [0, p.opacity, p.opacity, 0],
            scale: [0.5, 1, 1, 0.3],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.02, delayChildren: 0.3 },
  },
};

const charVariants = {
  hidden: { opacity: 0, y: 10, filter: "blur(2px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.15, ease: "easeOut" },
  },
};

export function DailySentence() {
  const [sentence, setSentence] = useState<string | null>(null);
  const [date, setDate] = useState("");

  useEffect(() => {
    getTodaySentence()
      .then((text) => setSentence(text))
      .catch((err) => {
        console.error("Failed to load sentence:", err);
        setSentence("오늘 하루도 당신은 충분히 잘하고 있어요.");
      });
    setDate(getTodayDateKST());
  }, []);

  if (!sentence) return null;

  const characters = sentence.split("");

  return (
    <div className="relative flex flex-col items-center justify-center gap-6 w-full max-w-md mx-auto">
      <FloatingParticles />

      {/* 날짜 */}
      <motion.p
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-base text-muted-foreground tracking-wide"
      >
        {date}
      </motion.p>

      {/* 타이틀 */}
      <motion.h1
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.25, type: "spring", stiffness: 150, damping: 15 }}
        className="text-lg font-semibold text-primary"
      >
        오늘의 운세
      </motion.h1>

      {/* 문장 */}
      <motion.p
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="text-2xl font-normal text-foreground/70 tracking-wide text-center leading-relaxed px-2"
      >
        {characters.map((char, i) => (
          <span key={i}>
            <motion.span
              variants={charVariants}
              className="inline-block"
            >
              {char === " " ? "\u00A0" : char}
            </motion.span>
            {char === "." && i < characters.length - 1 && <br />}
          </span>
        ))}
      </motion.p>

      {/* 장식선 */}
      <motion.div
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: 1, opacity: 1 }}
        transition={{ delay: 2, duration: 0.8, ease: "easeOut" }}
        className="w-16 h-0.5 bg-gradient-to-r from-transparent via-primary/50 to-transparent"
      />

      {/* 하단 장식 이모지 */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.3 }}
        className="text-2xl"
      >
        ✨
      </motion.div>
    </div>
  );
}
