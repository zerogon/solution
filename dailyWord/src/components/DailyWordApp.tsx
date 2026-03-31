"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
  message: string;
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
          message: data.alreadySelected.message,
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

      await new Promise((r) => setTimeout(r, 600));

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
          setResult(wordsData.alreadySelected);
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
    let currentIndex = 0;

    const step = () => {
      setHighlightedIndex(currentIndex % words.length);
      currentIndex++;
      interval *= ROULETTE_MULTIPLIER;

      if (interval < ROULETTE_MAX_INTERVAL) {
        rouletteRef.current = setTimeout(step, interval);
      } else {
        const finalIndex = currentIndex % words.length;
        setHighlightedIndex(null);
        submitSelection(finalIndex);
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
      <div className="flex flex-col items-center gap-6 w-full max-w-xs">
        <Skeleton className="h-7 w-32 rounded-lg" />
        <div className="grid grid-cols-3 gap-3 w-full">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-4 w-48 rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <motion.h1
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-xl font-bold text-foreground"
      >
        오늘의 단어
      </motion.h1>

      <AnimatePresence mode="wait">
        {state === "result" && result ? (
          <motion.div
            key="result"
            className="flex flex-col items-center w-full"
          >
            <ResultCard word={result.word} message={result.message} />
            <Separator className="my-4 max-w-xs" />
            <TodayStats />
          </motion.div>
        ) : (
          <motion.div
            key="grid"
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
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
          className="text-xs text-muted-foreground"
        >
          마음에 드는 단어를 선택하세요
        </motion.p>
      )}
    </div>
  );
}
