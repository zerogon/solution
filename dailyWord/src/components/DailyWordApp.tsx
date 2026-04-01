"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useSession } from "@/hooks/useSession";
import { MemoryGrid } from "./MemoryGrid";
import { ResultCard } from "./ResultCard";
import { TodayStats } from "./TodayStats";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { MEMORIZE_DURATION, MISMATCH_DELAY } from "@/lib/constants";
import {
  selectRandomWords,
  createShuffledDeck,
  type MemoryCard,
} from "@/lib/gameUtils";

interface WordItem {
  id: number;
  word: string;
  displayOrder: number;
}

type GameState = "loading" | "ready" | "memorizing" | "playing" | "result";

interface Result {
  word: string;
  fortune: string | null;
}

export function DailyWordApp() {
  const sessionId = useSession();
  const [gameState, setGameState] = useState<GameState>("loading");
  const [deck, setDeck] = useState<MemoryCard[]>([]);
  const [faceUpIds, setFaceUpIds] = useState<Set<number>>(new Set());
  const [matchedIds, setMatchedIds] = useState<Set<number>>(new Set());
  const [firstFlip, setFirstFlip] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [allWords, setAllWords] = useState<WordItem[]>([]);
  const memorizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mismatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setAllWords(data.words);

      if (data.alreadySelected) {
        setResult({
          word: data.alreadySelected.word,
          fortune: data.alreadySelected.fortune ?? null,
        });
        setGameState("result");
        return;
      }

      const selected = selectRandomWords(data.words, 4);
      const shuffled = createShuffledDeck(selected);
      setDeck(shuffled);
      setGameState("ready");
    };

    init();
  }, [sessionId]);

  useEffect(() => {
    return () => {
      if (memorizeTimerRef.current) clearTimeout(memorizeTimerRef.current);
      if (mismatchTimerRef.current) clearTimeout(mismatchTimerRef.current);
    };
  }, []);

  const startGame = useCallback(() => {
    const allIds = new Set(deck.map((c) => c.cardId));
    setFaceUpIds(allIds);
    setGameState("memorizing");

    memorizeTimerRef.current = setTimeout(() => {
      setFaceUpIds(new Set());
      setGameState("playing");
    }, MEMORIZE_DURATION);
  }, [deck]);

  const handleFlipCard = useCallback(
    (cardId: number) => {
      if (isProcessing) return;
      if (faceUpIds.has(cardId) || matchedIds.has(cardId)) return;

      if (firstFlip === null) {
        // First card of the turn
        setFirstFlip(cardId);
        setFaceUpIds((prev) => new Set([...prev, cardId]));
        return;
      }

      // Second card of the turn
      const secondCardId = cardId;
      setFaceUpIds((prev) => new Set([...prev, secondCardId]));
      setIsProcessing(true);

      const firstCard = deck.find((c) => c.cardId === firstFlip)!;
      const secondCard = deck.find((c) => c.cardId === secondCardId)!;

      if (firstCard.pairId === secondCard.pairId) {
        // Match!
        const newMatched = new Set([...matchedIds, firstFlip, secondCardId]);
        setMatchedIds(newMatched);
        setFirstFlip(null);
        setIsProcessing(false);

        // First match = today's word selection
        if (matchedIds.size === 0) {
          submitSelection(firstCard.wordId);
        }
      } else {
        // No match - flip back after delay
        mismatchTimerRef.current = setTimeout(() => {
          setFaceUpIds((prev) => {
            const next = new Set(prev);
            next.delete(firstFlip);
            next.delete(secondCardId);
            return next;
          });
          setFirstFlip(null);
          setIsProcessing(false);
        }, MISMATCH_DELAY);
      }
    },
    [isProcessing, faceUpIds, matchedIds, firstFlip, deck]
  );

  const resetGame = useCallback(async () => {
    if (memorizeTimerRef.current) clearTimeout(memorizeTimerRef.current);
    if (mismatchTimerRef.current) clearTimeout(mismatchTimerRef.current);

    await fetch("/api/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });

    const selected = selectRandomWords(allWords, 4);
    const shuffled = createShuffledDeck(selected);
    setDeck(shuffled);
    setFaceUpIds(new Set());
    setMatchedIds(new Set());
    setFirstFlip(null);
    setIsProcessing(false);
    setResult(null);
    setGameState("ready");
  }, [allWords, sessionId]);

  const submitSelection = useCallback(
    async (wordId: number) => {
      if (!sessionId) return;

      const res = await fetch("/api/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, wordId }),
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

      setGameState("result");
    },
    [sessionId]
  );

  if (gameState === "loading") {
    return (
      <div className="flex flex-col items-center gap-6 w-full max-w-md">
        <Skeleton className="h-7 w-32 rounded-lg" />
        <div className="grid grid-cols-4 gap-2.5 w-full">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
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
        {gameState === "result" && result ? (
          <motion.div
            key="result"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center w-full"
          >
            <ResultCard word={result.word} fortune={result.fortune} />
            <Separator className="my-4 max-w-xs" />
            <TodayStats />
          </motion.div>
        ) : (
          <motion.div
            key="game"
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="w-full flex flex-col items-center gap-5"
          >
            <MemoryGrid
              cards={deck}
              faceUpIds={faceUpIds}
              matchedIds={matchedIds}
              disabled={gameState !== "playing" || isProcessing}
              onFlipCard={handleFlipCard}
            />

            {gameState === "ready" && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                onClick={startGame}
                className="px-6 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl shadow-md hover:opacity-90 active:scale-95 transition-all cursor-pointer"
              >
                시작하기
              </motion.button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {process.env.NODE_ENV === "development" && (
        <button
          onClick={resetGame}
          className="fixed bottom-4 right-4 px-3 py-1.5 text-xs bg-red-500 text-white rounded-lg opacity-60 hover:opacity-100 transition-opacity z-50"
        >
          DEV: 초기화
        </button>
      )}

      {gameState === "memorizing" && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-muted-foreground"
        >
          카드를 기억하세요!
        </motion.p>
      )}
      {gameState === "playing" && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-muted-foreground"
        >
          짝이 맞는 카드를 찾아보세요
        </motion.p>
      )}
    </div>
  );
}
