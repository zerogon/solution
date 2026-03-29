"use client";

interface Props {
  value: string;
  onChange: (type: string) => void;
}

const TYPES = ["수시", "정시"];

/** 수시/정시 전환 토글 (pill 스타일) */
export default function AdmissionTypeToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex rounded-lg bg-gray-100 p-1">
      {TYPES.map((type) => (
        <button
          key={type}
          onClick={() => onChange(type)}
          className={`px-4 py-2 rounded-md text-sm font-semibold transition-all ${
            value === type
              ? "bg-white text-blue-600 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {type}
        </button>
      ))}
    </div>
  );
}
