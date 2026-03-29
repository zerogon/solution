"use client";

import { useState, useMemo } from "react";
import AdmissionTypeToggle from "./AdmissionTypeToggle";
import YearSelector from "./YearSelector";
import DashboardGrid from "./DashboardGrid";
import RateChart from "./RateChart";
import SortableTable from "./SortableTable";
import type { DashboardRate } from "@/db/queries";
import type { DepartmentRateData } from "./RateChart";

interface Props {
  allData: DashboardRate[];
}

/** 학과별 그룹 키 */
function deptKey(d: DashboardRate) {
  return `${d.universityName}::${d.departmentName}`;
}

// 10색 팔레트
const CHART_COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed",
  "#0891b2", "#be185d", "#65a30d", "#ea580c", "#6366f1",
];

/** 실용음악과 경쟁률 대시보드 메인 컴포넌트 */
export default function Dashboard({ allData }: Props) {
  const [admissionType, setAdmissionType] = useState("수시");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  // 가용 연도 추출
  const years = useMemo(() => {
    const set = new Set(allData.map((d) => d.year));
    return Array.from(set).sort((a, b) => a - b);
  }, [allData]);

  const [selectedYear, setSelectedYear] = useState(() => years[years.length - 1] ?? 2025);

  // 선택된 전형으로 필터
  const filtered = useMemo(
    () => allData.filter((d) => d.admissionType === admissionType),
    [allData, admissionType]
  );

  // 차트 데이터: 학과별 라인
  const chartDatasets: DepartmentRateData[] = useMemo(() => {
    const groupMap = new Map<string, DashboardRate[]>();
    for (const d of filtered) {
      const key = deptKey(d);
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(d);
    }

    return Array.from(groupMap.entries()).map(([key, data], i) => {
      const [univ, dept] = key.split("::");
      // 대학명 축약 (학교 제거)
      const shortUniv = univ.replace("대학교", "대").replace("여자", "여");
      return {
        label: `${shortUniv} ${dept}`,
        data: data.map((d) => ({ year: d.year, rate: d.rate, applicants: d.applicants, accepted: d.accepted })),
        color: CHART_COLORS[i % CHART_COLORS.length],
      };
    });
  }, [filtered]);

  // 테이블 데이터: 선택된 연도 + 전형
  const tableData = useMemo(
    () => filtered.filter((d) => d.year === selectedYear),
    [filtered, selectedYear]
  );

  const handleToggle = (key: string) => {
    setExpandedKey((prev) => (prev === key ? null : key));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* 헤더: 타이틀 + 필터 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">실용음악 입시 경쟁률</h1>
          <p className="text-sm text-gray-500 mt-1">대학별 경쟁률을 한눈에 비교하세요</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <AdmissionTypeToggle value={admissionType} onChange={setAdmissionType} />
          <YearSelector years={years} value={selectedYear} onChange={setSelectedYear} />
        </div>
      </div>

      {/* 카드 그리드 */}
      <DashboardGrid
        allData={allData}
        filteredData={filtered}
        selectedYear={selectedYear}
        expandedKey={expandedKey}
        onToggle={handleToggle}
      />

      {/* 추이 차트 */}
      <RateChart
        datasets={chartDatasets}
        title={`연도별 경쟁률 추이 (${admissionType})`}
        height={360}
      />

      {/* 데이터 테이블 */}
      <SortableTable data={tableData} />
    </div>
  );
}
