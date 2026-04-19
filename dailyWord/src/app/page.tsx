"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail } from "lucide-react";
import { DailySentence } from "@/components/DailySentence";
import { ZodiacFortune } from "@/components/ZodiacFortune";
import { IdeaModal } from "@/components/IdeaModal";
import { useSession } from "@/hooks/useSession";
import { useDeviceId } from "@/hooks/useDeviceId";

type Version = "v1" | "v2";

export default function Home() {
  const [version, setVersion] = useState<Version>("v1");
  const [mounted, setMounted] = useState(false);
  const [ideaOpen, setIdeaOpen] = useState(false);
  const sessionId = useSession();
  const deviceId = useDeviceId();
  const trackedRef = useRef<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("dailyword_version") as Version | null;
    if (saved === "v1" || saved === "v2") {
      setVersion(saved);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !sessionId || !deviceId) return;
    const page = version === "v1" ? "daily_sentence" : "zodiac_fortune";
    if (trackedRef.current === `${version}-${deviceId}`) return;
    trackedRef.current = `${version}-${deviceId}`;
    fetch("/api/page-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, deviceId, page }),
    }).catch(() => {});
  }, [mounted, sessionId, deviceId, version]);

  const handleVersionChange = (v: Version) => {
    setVersion(v);
    localStorage.setItem("dailyword_version", v);
  };

  return (
    <main className="relative flex min-h-dvh flex-col items-center px-4 py-8">
      {/* 아이디어 보내기 아이콘 */}
      {mounted && (
        <button
          onClick={() => setIdeaOpen(true)}
          className="fixed top-4 right-4 z-40 rounded-full p-2 text-foreground/40 transition-colors hover:bg-secondary hover:text-foreground/70"
          aria-label="아이디어 보내기"
        >
          <Mail className="h-5 w-5" />
        </button>
      )}

      <IdeaModal open={ideaOpen} onOpenChange={setIdeaOpen} />

      {mounted && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-2 mb-4"
        >
          <button
            onClick={() => handleVersionChange("v1")}
            className={`px-4 py-1.5 rounded-full text-3xl font-medium transition-all ${
              version === "v1"
                ? "bg-primary text-white shadow-md"
                : "bg-secondary text-foreground/60 hover:text-foreground/80"
            }`}
          >
            오늘의 문장
          </button>
          <button
            onClick={() => handleVersionChange("v2")}
            className={`px-4 py-1.5 rounded-full text-3xl font-medium transition-all ${
              version === "v2"
                ? "bg-primary text-white shadow-md"
                : "bg-secondary text-foreground/60 hover:text-foreground/80"
            }`}
          >
            띠별 운세
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
              className="w-full flex items-center justify-center"
            >
              <DailySentence />
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
