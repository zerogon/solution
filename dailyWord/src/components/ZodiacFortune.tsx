"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getTodayFortune,
  getTodayDateKST,
  type ZodiacFortune as ZodiacFortuneType,
} from "@/lib/zodiac-fortunes";

const ZODIAC_ANIMALS = [
  { key: "rat", emoji: "🐭", label: "쥐띠", years: "1984, 1996, 2008" },
  { key: "ox", emoji: "🐮", label: "소띠", years: "1985, 1997, 2009" },
  { key: "tiger", emoji: "🐯", label: "호랑이띠", years: "1986, 1998, 2010" },
  { key: "rabbit", emoji: "🐰", label: "토끼띠", years: "1987, 1999, 2011" },
  { key: "dragon", emoji: "🐲", label: "용띠", years: "1988, 2000, 2012" },
  { key: "snake", emoji: "🐍", label: "뱀띠", years: "1989, 2001, 2013" },
  { key: "horse", emoji: "🐴", label: "말띠", years: "1990, 2002, 2014" },
  { key: "sheep", emoji: "🐑", label: "양띠", years: "1991, 2003, 2015" },
  { key: "monkey", emoji: "🐒", label: "원숭이띠", years: "1992, 2004, 2016" },
  { key: "rooster", emoji: "🐔", label: "닭띠", years: "1993, 2005, 2017" },
  { key: "dog", emoji: "🐶", label: "개띠", years: "1994, 2006, 2018" },
  { key: "pig", emoji: "🐷", label: "돼지띠", years: "1995, 2007, 2019" },
] as const;

const fortuneCategories = [
  { key: "overall" as const, label: "총운", emoji: "🔮" },
  { key: "love" as const, label: "애정운", emoji: "💕" },
  { key: "money" as const, label: "금전운", emoji: "💰" },
  { key: "health" as const, label: "건강운", emoji: "🏃" },
];

function ScoreStars({ score }: { score: number }) {
  return (
    <span className="text-base tracking-wider">
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < score ? "text-yellow-400" : "text-gray-300"}>
          ★
        </span>
      ))}
    </span>
  );
}

function ZodiacGrid({ onSelect }: { onSelect: (key: string) => void }) {
  return (
    <div className="flex flex-col items-center gap-5 w-full max-w-lg">
      <motion.h1
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-5xl font-bold text-foreground"
      >
        오늘의 운세
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-xl text-muted-foreground"
      >
        나의 띠를 선택하세요
      </motion.p>

      <div className="grid grid-cols-3 gap-4 w-full">
        {ZODIAC_ANIMALS.map((animal, i) => (
          <motion.button
            key={animal.key}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 + i * 0.04 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onSelect(animal.key)}
            className="flex flex-col items-center gap-2 p-5 rounded-2xl bg-white shadow-md hover:shadow-lg transition-shadow cursor-pointer"
          >
            <span className="text-6xl">{animal.emoji}</span>
            <span className="text-base font-semibold text-foreground">{animal.label}</span>
            <span className="text-sm text-muted-foreground leading-tight text-center">
              {animal.years}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function FortuneDetail({
  zodiac,
  onBack,
}: {
  zodiac: (typeof ZODIAC_ANIMALS)[number];
  onBack: () => void;
}) {
  const [fortune, setFortune] = useState<ZodiacFortuneType | null>(null);
  const [date, setDate] = useState("");

  useEffect(() => {
    setFortune(getTodayFortune());
    setDate(getTodayDateKST());
  }, []);

  if (!fortune) {
    return (
      <div className="flex flex-col items-center gap-4 w-full max-w-sm">
        <Skeleton className="h-10 w-48 rounded-lg" />
        <Skeleton className="h-6 w-32 rounded-md" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  const scoreMap = {
    overall: fortune.overallScore,
    love: fortune.loveScore,
    money: fortune.moneyScore,
    health: fortune.healthScore,
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-lg">
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onBack}
        className="self-start text-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        ← 띠 선택
      </motion.button>

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-5xl font-bold text-foreground">오늘의 운세</h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
        className="text-center"
      >
        <div className="text-8xl mb-3">{zodiac.emoji}</div>
        <p className="text-2xl font-semibold text-primary">{zodiac.label}</p>
        <p className="text-lg text-muted-foreground">{date}</p>
      </motion.div>

      {fortuneCategories.map((cat, i) => (
        <motion.div
          key={cat.key}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 + i * 0.1 }}
          className="w-full"
        >
          <Card className="border-none shadow-md">
            <CardContent className="pt-6 pb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-3xl">{cat.emoji}</span>
                  <span className="text-xl font-bold text-foreground">{cat.label}</span>
                </div>
                <ScoreStars score={scoreMap[cat.key]} />
              </div>
              <p className="text-lg text-foreground/80 leading-relaxed">
                {fortune[cat.key]}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      ))}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8 }}
        className="w-full"
      >
        <Card className="border-none shadow-md bg-gradient-to-r from-indigo-50 to-purple-50">
          <CardContent className="pt-6 pb-6">
            <div className="flex justify-around text-center">
              <div>
                <p className="text-base text-muted-foreground mb-1">럭키 컬러</p>
                <p className="text-2xl font-bold text-primary">
                  {fortune.luckyColor}
                </p>
              </div>
              <Separator orientation="vertical" className="h-16" />
              <div>
                <p className="text-base text-muted-foreground mb-1">럭키 넘버</p>
                <p className="text-2xl font-bold text-primary">
                  {fortune.luckyNumber}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export function ZodiacFortune() {
  const [selectedZodiac, setSelectedZodiac] = useState<string | null>(null);

  const selected = ZODIAC_ANIMALS.find((a) => a.key === selectedZodiac);

  return (
    <AnimatePresence mode="wait">
      {!selected ? (
        <motion.div
          key="grid"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
        >
          <ZodiacGrid onSelect={setSelectedZodiac} />
        </motion.div>
      ) : (
        <motion.div
          key="detail"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.25 }}
        >
          <FortuneDetail
            zodiac={selected}
            onBack={() => setSelectedZodiac(null)}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
