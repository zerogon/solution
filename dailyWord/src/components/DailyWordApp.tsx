"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Coffee } from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { WordGrid } from "./WordGrid";
import { ResultCard } from "./ResultCard";
import { TodayStats } from "./TodayStats";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  ROULETTE_INITIAL_INTERVAL,
  ROULETTE_MULTIPLIER,
  ROULETTE_MAX_INTERVAL,
} from "@/lib/constants";

interface WordItem {
  id: number;
  word: string;
  displayOrder: number;
}

type AppState = "loading" | "grid" | "animating" | "result";

interface Result {
  word: string;
  fortune: string | null;
  alreadyRevealed?: boolean;
}

export function DailyWordApp() {
  const sessionId = useSession();
  const [state, setState] = useState<AppState>("loading");
  const [words, setWords] = useState<WordItem[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const rouletteRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const init = async () => {
      fetch("/api/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          userAgent: navigator.userAgent,
        }),
      });

      const res = await fetch(`/api/words?sessionId=${sessionId}`);
      const data = await res.json();
      setWords(data.words);

      if (data.alreadySelected) {
        setResult({
          word: data.alreadySelected.word,
          fortune: data.alreadySelected.fortune ?? null,
          alreadyRevealed: true,
        });
        setState("result");
      } else {
        setState("grid");
      }
    };

    init();
  }, [sessionId]);

  const submitSelection = useCallback(
    async (wordIndex: number) => {
      if (!sessionId) return;
      const word = words[wordIndex];
      setSelectedIndex(wordIndex);
      setState("animating");

      await new Promise((r) => setTimeout(r, 150));

      const res = await fetch("/api/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, wordId: word.id }),
      });

      if (res.ok) {
        const data = await res.json();
        setResult(data);
      } else {
        const wordsRes = await fetch(`/api/words?sessionId=${sessionId}`);
        const wordsData = await wordsRes.json();
        if (wordsData.alreadySelected) {
          setResult({
            ...wordsData.alreadySelected,
            alreadyRevealed: true,
          });
        }
      }

      setState("result");
    },
    [sessionId, words]
  );

  const handleSelectWord = useCallback(
    (index: number) => {
      if (state !== "grid") return;
      submitSelection(index);
    },
    [state, submitSelection]
  );

  const handleSelectRandom = useCallback(() => {
    if (state !== "grid") return;
    setState("animating");

    let interval = ROULETTE_INITIAL_INTERVAL;
    // 랜덤 시작 위치로 매번 다른 결과 보장
    let currentIndex = Math.floor(Math.random() * words.length);
    // 최대 인터벌에 ±20% 랜덤 변동 추가
    const maxInterval =
      ROULETTE_MAX_INTERVAL * (0.8 + Math.random() * 0.4);

    const step = () => {
      const idx = currentIndex % words.length;
      setHighlightedIndex(idx);
      currentIndex++;
      interval *= ROULETTE_MULTIPLIER;

      if (interval < maxInterval) {
        rouletteRef.current = setTimeout(step, interval);
      } else {
        // 마지막 하이라이트를 잠시 유지 후 제출
        rouletteRef.current = setTimeout(() => {
          setHighlightedIndex(null);
          submitSelection(idx);
        }, 500);
      }
    };

    step();
  }, [state, words.length, submitSelection]);

  useEffect(() => {
    return () => {
      if (rouletteRef.current) clearTimeout(rouletteRef.current);
    };
  }, []);

  if (state === "loading") {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-sm">
        <Skeleton className="h-7 w-32 rounded-lg" />
        <div className="grid grid-cols-3 gap-2.5 w-full">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-4 w-48 rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <motion.a
        href="https://api.handorder.co.kr/data/r?r=QFYWQT"
        target="_blank"
        rel="noopener noreferrer"
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.8, type: "spring", stiffness: 260, damping: 20 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="fixed top-4 right-4 z-50 flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl bg-white/80 backdrop-blur-sm text-stone-600 shadow-md ring-1 ring-stone-200/60 hover:bg-white hover:shadow-lg hover:text-stone-800 transition-all"
      >
        <Coffee className="w-6 h-6" />
        <span className="text-[10px] font-semibold leading-tight">세이프토피아</span>
      </motion.a>

      <motion.h1
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-3xl font-bold text-foreground"
      >
        오늘의 단어
      </motion.h1>

      <AnimatePresence mode="wait">
        {state === "result" && result ? (
          <motion.div
            key="result"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center w-full"
          >
            <ResultCard
              word={result.word}
              fortune={result.fortune}
              alreadyRevealed={result.alreadyRevealed}
            />
            <Separator className="my-4 max-w-xs" />
            <TodayStats />
          </motion.div>
        ) : (
          <motion.div
            key="grid"
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="w-full flex justify-center"
          >
            <WordGrid
              words={words}
              highlightedIndex={highlightedIndex}
              selectedIndex={selectedIndex}
              disabled={state === "animating"}
              onSelectWord={handleSelectWord}
              onSelectRandom={handleSelectRandom}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {state === "grid" && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-base text-muted-foreground"
        >
          마음에 드는 단어를 선택하세요
        </motion.p>
      )}
    </div>
  );
}
