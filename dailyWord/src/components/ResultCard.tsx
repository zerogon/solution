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
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full max-w-sm"
    >
      <Card className="border-none shadow-lg text-center">
        <CardContent className="pt-8 pb-8">
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="text-sm text-muted-foreground mb-4"
          >
            오늘의 단어
          </motion.p>
          <motion.h2
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
            className="text-3xl font-bold text-primary mb-6"
          >
            {word}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="text-base text-foreground/80 leading-relaxed"
          >
            &ldquo;{message}&rdquo;
          </motion.p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
