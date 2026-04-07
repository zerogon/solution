"use client";

import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";

interface ResultCardProps {
  word: string;
  fortune: string | null;
}

export function ResultCard({ word, fortune }: ResultCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="w-full max-w-sm"
    >
      <Card className="border-none shadow-lg text-center">
        <CardContent className="pt-8 pb-8">
          <motion.h2
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
            className="text-4xl font-bold text-primary mb-6"
          >
            &ldquo;{word}&rdquo;
          </motion.h2>
          {fortune && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <div className="w-1/3 mx-auto border-t border-border/40 mb-5" />
              <p className="text-sm text-muted-foreground mb-2">오늘의 운세</p>
              <p className="text-lg text-foreground/80 leading-relaxed">
                {fortune}
              </p>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
