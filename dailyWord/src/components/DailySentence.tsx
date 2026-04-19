"use client";

import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { getTodaySentence, getTodayDateKST } from "@/lib/daily-sentences";
import { useDeviceId } from "@/hooks/useDeviceId";
import Lottie from "lottie-react";
import { characters } from "@/lib/characters";


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

function RandomAnimatedCharacter({ size = 96 }: { size?: number }) {
  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    let cancelled = false;
    const pool = [...characters].sort(() => Math.random() - 0.5);

    (async () => {
      for (const c of pool) {
        try {
          const res = await fetch(c.lottieUrl);
          if (!res.ok) continue;
          const data = await res.json();
          if (cancelled) return;
          setAnimationData(data);
          return;
        } catch {
          continue;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!animationData) return null;

  return (
    <Lottie
      animationData={animationData}
      loop
      style={{ width: size, height: size }}
    />
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
  const deviceId = useDeviceId();
  const [sentence, setSentence] = useState<string | null>(null);
  const [date, setDate] = useState("");

  useEffect(() => {
    setDate(getTodayDateKST());
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    getTodaySentence(deviceId)
      .then((text) => setSentence(text))
      .catch((err) => {
        console.error("Failed to load sentence:", err);
        setSentence("오늘 하루도 당신은 충분히 잘하고 있어요.");
      });
  }, [deviceId]);

  if (!sentence) return null;

  const sentenceChars = sentence.split("");

  return (
    <div className="relative flex flex-col items-center justify-center gap-6 w-full max-w-md mx-auto">
      <FloatingParticles />

      {/* 날짜 */}
      <motion.p
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-2xl text-muted-foreground tracking-wide"
      >
        {date}
      </motion.p>

      {/* 문장 */}
      <motion.p
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="text-3xl font-medium text-foreground/90 tracking-wide text-center leading-relaxed px-4 py-4 rounded-2xl bg-gradient-to-b from-primary/5 to-transparent [text-shadow:0_0_18px_hsl(var(--primary)/0.25)]"
      >
        {sentenceChars.map((char, i) => (
          <span key={i}>
            <motion.span
              variants={charVariants}
              className="inline-block"
            >
              {char === " " ? "\u00A0" : char}
            </motion.span>
            {char === "." && i < sentenceChars.length - 1 && <br />}
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

      {/* 하단 장식: 랜덤 귀여운 캐릭터 애니메이션 */}
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.5 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 2.3, type: "spring", stiffness: 200, damping: 12 }}
      >
        <RandomAnimatedCharacter size={96} />
      </motion.div>
    </div>
  );
}
