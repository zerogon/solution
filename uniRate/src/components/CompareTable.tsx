"use client";

/** 단일 학과의 특정 연도 데이터 */
export interface CompareEntry {
  departmentId: number;
  university: string;
  department: string;
  year: number;
  applicants: number;
  accepted: number;
  rate: number;
  admissionType: string;
}

interface Props {
  /** 비교할 학과/연도 데이터 목록 */
  entries: CompareEntry[];
  /** 기준 연도 (하이라이트용) */
  highlightYear?: number;
}

/**
 * 대학/학과 비교 테이블 컴포넌트
 * - 여러 학과의 지원자 수, 합격자 수, 경쟁률을 나란히 비교
 * - 경쟁률 높은 순 정렬
 */
export default function CompareTable({ entries, highlightYear }: Props) {
  if (!entries || entries.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <p className="text-gray-400">비교할 데이터가 없습니다.</p>
      </div>
    );
  }

  // 경쟁률 높은 순 정렬
  const sorted = [...entries].sort((a, b) => b.rate - a.rate);
  const maxRate = sorted[0]?.rate ?? 1;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-600">대학교</th>
              <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-600">학과</th>
              <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-600 hidden sm:table-cell">전형</th>
              <th className="text-right px-5 py-3.5 text-sm font-semibold text-gray-600">년도</th>
              <th className="text-right px-5 py-3.5 text-sm font-semibold text-gray-600 hidden md:table-cell">지원자</th>
              <th className="text-right px-5 py-3.5 text-sm font-semibold text-gray-600 hidden md:table-cell">합격자</th>
              <th className="text-right px-5 py-3.5 text-sm font-semibold text-gray-600">경쟁률</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry, index) => {
              const isHighlight = highlightYear && entry.year === highlightYear;
              const ratePercent = (entry.rate / maxRate) * 100;

              return (
                <tr
                  key={`${entry.departmentId}-${entry.year}`}
                  className={`transition-colors ${
                    isHighlight ? "bg-blue-50" : "hover:bg-gray-50"
                  } ${index < sorted.length - 1 ? "border-b border-gray-50" : ""}`}
                >
                  <td className="px-5 py-4 font-medium text-gray-900">{entry.university}</td>
                  <td className="px-5 py-4 text-gray-700">{entry.department}</td>
                  <td className="px-5 py-4 text-gray-500 hidden sm:table-cell">
                    <span className="bg-gray-100 px-2 py-0.5 rounded-full text-xs">
                      {entry.admissionType}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right text-gray-600">{entry.year}</td>
                  <td className="px-5 py-4 text-right text-gray-600 hidden md:table-cell">
                    {entry.applicants.toLocaleString()}명
                  </td>
                  <td className="px-5 py-4 text-right text-gray-600 hidden md:table-cell">
                    {entry.accepted.toLocaleString()}명
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* 경쟁률 바 (상대적 길이) */}
                      <div className="hidden lg:block w-16 bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full"
                          style={{ width: `${ratePercent}%` }}
                        />
                      </div>
                      <span className="text-blue-600 font-bold">
                        {entry.rate.toFixed(1)}
                      </span>
                      <span className="text-gray-400 text-sm">: 1</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
