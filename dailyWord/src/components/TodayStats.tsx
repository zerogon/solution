"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StatItem {
  word: string;
  count: number;
  percentage: number;
}

const badgeVariants: Array<"default" | "secondary" | "outline"> = [
  "default",
  "secondary",
  "outline",
];

export function TodayStats() {
  const [stats, setStats] = useState<StatItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then((res) => res.json())
      .then((data) => {
        setStats(data.stats ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (stats.length === 0) return null;

  const medals = ["1위", "2위", "3위"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8 }}
      className="w-full max-w-md mt-4"
    >
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-normal text-muted-foreground text-center">
            오늘 가장 많이 선택된 단어
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {stats.map((s, i) => (
            <motion.div
              key={s.word}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.0 + i * 0.2 }}
              className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2"
            >
              <Badge variant={badgeVariants[i]} className="text-sm">
                {medals[i]}
              </Badge>
              <span className="flex-1 text-lg font-medium">{s.word}</span>
              <div className="flex items-center gap-2 w-36">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${s.percentage}%` }}
                    transition={{ delay: 1.2 + i * 0.2, duration: 0.6 }}
                  />
                </div>
                <span className="text-base font-medium text-muted-foreground text-right whitespace-nowrap leading-tight">
                  {s.percentage}% ({s.count}명)
                </span>
              </div>
            </motion.div>
          ))}
        </CardContent>
      </Card>
    </motion.div>
  );
}
