"use client";

import DepartmentCard from "./DepartmentCard";
import type { DashboardRate } from "@/db/queries";

interface Props {
  /** 전체 데이터 (모든 전형, 모든 연도) */
  allData: DashboardRate[];
  /** 선택된 전형으로 필터된 데이터 */
  filteredData: DashboardRate[];
  /** 선택된 연도 */
  selectedYear: number;
  /** 확장된 카드 키 */
  expandedKey: string | null;
  /** 카드 토글 핸들러 */
  onToggle: (key: string) => void;
}

/** 학과별 그룹 키 생성 */
function deptKey(d: DashboardRate) {
  return `${d.universityName}::${d.departmentName}`;
}

/** 학과 카드 그리드 (경쟁률 내림차순 정렬) */
export default function DashboardGrid({
  allData,
  filteredData,
  selectedYear,
  expandedKey,
  onToggle,
}: Props) {
  // 학과별 그룹핑
  const groupMap = new Map<string, DashboardRate[]>();
  for (const d of filteredData) {
    const key = deptKey(d);
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(d);
  }

  // 전체 데이터도 학과별 그룹핑 (확장 시 모든 전형 표시용)
  const allGroupMap = new Map<string, DashboardRate[]>();
  for (const d of allData) {
    const key = deptKey(d);
    if (!allGroupMap.has(key)) allGroupMap.set(key, []);
    allGroupMap.get(key)!.push(d);
  }

  // 선택된 연도 경쟁률 기준 내림차순 정렬
  const sorted = Array.from(groupMap.entries()).sort((a, b) => {
    const rateA = a[1].find((d) => d.year === selectedYear)?.rate ?? 0;
    const rateB = b[1].find((d) => d.year === selectedYear)?.rate ?? 0;
    return rateB - rateA;
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {sorted.map(([key, data]) => (
        <DepartmentCard
          key={key}
          allData={allGroupMap.get(key) ?? data}
          filteredData={data}
          selectedYear={selectedYear}
          isExpanded={expandedKey === key}
          onToggle={() => onToggle(key)}
        />
      ))}
    </div>
  );
}
