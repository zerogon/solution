"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { DailyWordApp } from "@/components/DailyWordApp";
import { ZodiacFortune } from "@/components/ZodiacFortune";

type Version = "v1" | "v2";

export default function Home() {
  const [version, setVersion] = useState<Version>("v1");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("dailyword_version") as Version | null;
    if (saved === "v1" || saved === "v2") {
      setVersion(saved);
    }
    setMounted(true);
  }, []);

  const handleVersionChange = (v: Version) => {
    setVersion(v);
    localStorage.setItem("dailyword_version", v);
  };

  return (
    <main className="flex min-h-dvh flex-col items-center px-4 py-8">
      {mounted && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-2 mb-6"
        >
          <button
            onClick={() => handleVersionChange("v1")}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              version === "v1"
                ? "bg-primary text-white shadow-md"
                : "bg-secondary text-foreground/60 hover:text-foreground/80"
            }`}
          >
            오늘의 단어
          </button>
          <button
            onClick={() => handleVersionChange("v2")}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              version === "v2"
                ? "bg-primary text-white shadow-md"
                : "bg-secondary text-foreground/60 hover:text-foreground/80"
            }`}
          >
            오늘의 운세
          </button>
        </motion.div>
      )}

      <div className={`flex flex-1 justify-center w-full ${version === "v1" ? "items-center" : "items-start"}`}>
        <AnimatePresence mode="wait">
          {version === "v1" ? (
            <motion.div
              key="v1"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="w-full"
            >
              <DailyWordApp />
            </motion.div>
          ) : (
            <motion.div
              key="v2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="w-full flex justify-center"
            >
              <ZodiacFortune />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
