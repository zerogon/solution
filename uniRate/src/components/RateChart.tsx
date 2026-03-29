"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

/** 단일 학과의 연도별 경쟁률 데이터 포인트 */
export interface RateDataPoint {
  year: number;
  rate: number;
  applicants?: number;
  accepted?: number;
}

/** 차트에 표시할 학과 데이터 */
export interface DepartmentRateData {
  /** 범례에 표시될 이름 (대학+학과) */
  label: string;
  /** 연도별 데이터 */
  data: RateDataPoint[];
  /** 차트 라인 색상 (없으면 기본 팔레트 사용) */
  color?: string;
}

interface Props {
  /** 표시할 학과 데이터 목록 (최대 5개 권장) */
  datasets: DepartmentRateData[];
  /** 차트 제목 */
  title?: string;
  /** 차트 높이 (px) */
  height?: number;
}

// 기본 색상 팔레트 (10색)
const DEFAULT_COLORS = [
  "#2563eb", // blue-600
  "#16a34a", // green-600
  "#dc2626", // red-600
  "#d97706", // amber-600
  "#7c3aed", // violet-600
  "#0891b2", // cyan-600
  "#be185d", // pink-700
  "#65a30d", // lime-600
  "#ea580c", // orange-600
  "#6366f1", // indigo-500
];

/**
 * 연도별 경쟁률 추이 라인 차트 컴포넌트 (Recharts)
 * - 여러 학과를 동시에 표시 가능
 * - 반응형 (ResponsiveContainer)
 */
export default function RateChart({ datasets, title, height = 320 }: Props) {
  if (!datasets || datasets.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <p className="text-gray-400">표시할 데이터가 없습니다.</p>
      </div>
    );
  }

  // 모든 연도 목록 추출 후 정렬
  const allYears = Array.from(
    new Set(datasets.flatMap((d) => d.data.map((p) => p.year)))
  ).sort((a, b) => a - b);

  // Recharts용 단일 배열로 변환: [{ year, label1: rate, label2: rate, ... }]
  const chartData = allYears.map((year) => {
    const entry: Record<string, number> = { year };
    for (const dataset of datasets) {
      const point = dataset.data.find((p) => p.year === year);
      if (point) {
        entry[dataset.label] = point.rate;
      }
    }
    return entry;
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      {title && (
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 12, fill: "#6b7280" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 12, fill: "#6b7280" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}:1`}
          />
          <Tooltip
            formatter={(value: number, name: string) => [`${value.toFixed(1)} : 1`, name]}
            labelFormatter={(label) => `${label}년`}
            contentStyle={{
              borderRadius: "12px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: "12px", paddingTop: "16px" }}
          />
          {datasets.map((dataset, index) => (
            <Line
              key={dataset.label}
              type="monotone"
              dataKey={dataset.label}
              stroke={dataset.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
