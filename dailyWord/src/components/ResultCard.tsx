"use client";

import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";

interface ResultCardProps {
  word: string;
  message: string;
}

export function ResultCard({ word, message }: ResultCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className="w-full max-w-sm"
    >
      <Card className="border-none shadow-lg text-center">
        <CardContent className="pt-8 pb-8">
          <p className="text-sm text-muted-foreground mb-4">오늘의 단어</p>
          <h2 className="text-3xl font-bold text-primary mb-6">{word}</h2>
          <p className="text-base text-foreground/80 leading-relaxed">
            &ldquo;{message}&rdquo;
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
