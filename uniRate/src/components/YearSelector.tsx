"use client";

interface Props {
  years: number[];
  value: number;
  onChange: (year: number) => void;
}

/** 연도 선택 pill 버튼 그룹 */
export default function YearSelector({ years, value, onChange }: Props) {
  return (
    <div className="flex gap-1.5">
      {years.map((year) => (
        <button
          key={year}
          onClick={() => onChange(year)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
            value === year
              ? "bg-blue-600 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {year}
        </button>
      ))}
    </div>
  );
}
