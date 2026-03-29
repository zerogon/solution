"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";

interface Props {
  data: { year: number; rate: number }[];
  color?: string;
}

/** 초소형 라인 차트 (카드 내 추이 표시용) */
export default function Sparkline({ data, color = "#2563eb" }: Props) {
  const sorted = [...data].sort((a, b) => a.year - b.year);

  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={sorted}>
        <Line
          type="monotone"
          dataKey="rate"
          stroke={color}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
