"use client";

import Sparkline from "./Sparkline";
import type { DashboardRate } from "@/db/queries";

interface Props {
  /** 해당 학과의 전체 데이터 (모든 연도, 모든 전형) */
  allData: DashboardRate[];
  /** 현재 선택된 전형으로 필터된 데이터 */
  filteredData: DashboardRate[];
  /** 현재 선택된 연도 */
  selectedYear: number;
  /** 확장 여부 */
  isExpanded: boolean;
  /** 클릭 핸들러 */
  onToggle: () => void;
}

/** 경쟁률 구간별 색상 */
function getRateColor(rate: number) {
  if (rate > 100) return { bg: "bg-red-50", text: "text-red-600", border: "border-red-200", sparkline: "#dc2626" };
  if (rate > 50) return { bg: "bg-orange-50", text: "text-orange-600", border: "border-orange-200", sparkline: "#d97706" };
  if (rate > 20) return { bg: "bg-yellow-50", text: "text-yellow-600", border: "border-yellow-200", sparkline: "#ca8a04" };
  return { bg: "bg-green-50", text: "text-green-600", border: "border-green-200", sparkline: "#16a34a" };
}

/** 대학/학과 경쟁률 카드 (클릭 시 인라인 확장) */
export default function DepartmentCard({
  allData,
  filteredData,
  selectedYear,
  isExpanded,
  onToggle,
}: Props) {
  const first = filteredData[0];
  if (!first) return null;

  // 선택된 연도의 데이터
  const yearData = filteredData.find((d) => d.year === selectedYear);
  const rate = yearData?.rate ?? filteredData[filteredData.length - 1]?.rate ?? 0;
  const colors = getRateColor(rate);

  // 스파크라인용 데이터
  const sparkData = filteredData.map((d) => ({ year: d.year, rate: d.rate }));

  return (
    <div
      className={`rounded-2xl border ${colors.border} ${colors.bg} shadow-sm transition-all cursor-pointer hover:shadow-md`}
      onClick={onToggle}
    >
      {/* 메인 카드 */}
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 truncate">{first.universityName}</h3>
            <p className="text-sm text-gray-500 truncate">{first.departmentName}</p>
          </div>
          <span className="text-xs text-gray-400 shrink-0 ml-2">{first.region}</span>
        </div>

        {/* 경쟁률 */}
        <div className="flex items-end justify-between">
          <div>
            <span className={`text-3xl font-extrabold ${colors.text}`}>
              {rate.toFixed(1)}
            </span>
            <span className="text-sm text-gray-400 ml-1">: 1</span>
          </div>
          <div className="w-20">
            <Sparkline data={sparkData} color={colors.sparkline} />
          </div>
        </div>

        {/* 지원자/모집 */}
        {yearData && (
          <div className="mt-2 flex gap-3 text-xs text-gray-500">
            <span>지원 {yearData.applicants.toLocaleString()}명</span>
            <span>모집 {yearData.accepted.toLocaleString()}명</span>
          </div>
        )}
      </div>

      {/* 인라인 확장 영역 */}
      {isExpanded && (
        <div className="border-t border-gray-200/50 px-5 pb-5 pt-4" onClick={(e) => e.stopPropagation()}>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">연도별 상세</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className="text-left pb-2">연도</th>
                <th className="text-left pb-2">전형</th>
                <th className="text-right pb-2">지원</th>
                <th className="text-right pb-2">모집</th>
                <th className="text-right pb-2">경쟁률</th>
              </tr>
            </thead>
            <tbody>
              {allData
                .sort((a, b) => b.year - a.year || a.admissionType.localeCompare(b.admissionType))
                .map((d, i) => (
                  <tr
                    key={`${d.year}-${d.admissionType}`}
                    className={`${
                      d.year === selectedYear ? "font-semibold text-gray-900" : "text-gray-600"
                    } ${i < allData.length - 1 ? "border-b border-gray-100" : ""}`}
                  >
                    <td className="py-1.5">{d.year}</td>
                    <td className="py-1.5">
                      <span className="bg-white/80 px-1.5 py-0.5 rounded text-xs">
                        {d.admissionType}
                      </span>
                    </td>
                    <td className="py-1.5 text-right">{d.applicants.toLocaleString()}</td>
                    <td className="py-1.5 text-right">{d.accepted.toLocaleString()}</td>
                    <td className="py-1.5 text-right font-medium">{d.rate.toFixed(1)}:1</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
