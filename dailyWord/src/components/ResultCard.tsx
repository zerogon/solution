"use client";

import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { CharacterReveal } from "@/components/character/CharacterReveal";
import { MenuRecommend } from "@/components/MenuRecommend";
import { Separator } from "@/components/ui/separator";

interface ResultCardProps {
  word: string;
  fortune: string | null;
  /** 이미 선택된 결과를 다시 보여줄 때 true (슬롯머신 연출 생략) */
  alreadyRevealed?: boolean;
}

export function ResultCard({ word, fortune, alreadyRevealed }: ResultCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full max-w-sm"
    >
      <Card className="border-none shadow-lg text-center">
        <CardContent className="pt-6 pb-6">
          <motion.h2
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
            className="text-4xl font-bold text-primary mb-4"
          >
            {word}
          </motion.h2>
          {fortune && (
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="text-lg text-foreground/80 leading-relaxed"
            >
              &ldquo;{fortune}&rdquo;
            </motion.p>
          )}

          {/* 오늘의 캐릭터 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: alreadyRevealed ? 0.3 : 0.8 }}
          >
            <Separator className="my-4" />
            <CharacterReveal instant={alreadyRevealed} />
            <Separator className="my-4" />
            <MenuRecommend />
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
