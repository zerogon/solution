"use client";

import { useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import RateChart, { DepartmentRateData } from "@/components/RateChart";
import CompareTable, { CompareEntry } from "@/components/CompareTable";
import SearchBar from "@/components/SearchBar";

interface DepartmentResult {
  id: number;
  universityId: number;
  name: string;
  category: string;
  universityName: string;
}

interface RateData {
  id: number;
  departmentId: number;
  admissionTypeName: string;
  year: number;
  applicants: number;
  accepted: number;
  rate: number;
}

interface SelectedDepartment {
  id: number;
  name: string;
  universityName: string;
  rates: RateData[];
  color?: string;
}

const CHART_COLORS = ["#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed"];

function CompareContent() {
  const searchParams = useSearchParams();
  const initialIds = (searchParams.get("deptIds") ?? "").split(",").filter(Boolean);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<DepartmentResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedDepts, setSelectedDepts] = useState<SelectedDepartment[]>([]);
  const [yearFrom, setYearFrom] = useState("2019");
  const [yearTo, setYearTo] = useState("2024");
  const [loadingId, setLoadingId] = useState<number | null>(null);

  // 학과 검색
  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/departments?search=${encodeURIComponent(q)}&limit=10`);
      const json = await res.json();
      setSearchResults(json.data ?? []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  // 학과 비교 목록에 추가
  const handleAddDepartment = useCallback(async (dept: DepartmentResult) => {
    if (selectedDepts.some((d) => d.id === dept.id)) return;
    if (selectedDepts.length >= 5) {
      alert("최대 5개 학과까지 비교할 수 있습니다.");
      return;
    }

    setLoadingId(dept.id);
    try {
      const params = new URLSearchParams({
        departmentId: String(dept.id),
        yearFrom,
        yearTo,
      });
      const res = await fetch(`/api/rates?${params}`);
      const json = await res.json();
      const newDept: SelectedDepartment = {
        id: dept.id,
        name: dept.name,
        universityName: dept.universityName,
        rates: json.data ?? [],
        color: CHART_COLORS[selectedDepts.length % CHART_COLORS.length],
      };
      setSelectedDepts((prev) => [...prev, newDept]);
    } catch {
      alert("데이터를 불러오는 데 실패했습니다.");
    } finally {
      setLoadingId(null);
    }
  }, [selectedDepts, yearFrom, yearTo]);

  // 학과 제거
  const handleRemoveDepartment = (id: number) => {
    setSelectedDepts((prev) => prev.filter((d) => d.id !== id));
  };

  // 차트 데이터 변환
  const chartDatasets: DepartmentRateData[] = selectedDepts.map((dept) => ({
    label: `${dept.universityName} ${dept.name}`,
    data: dept.rates.map((r) => ({ year: r.year, rate: r.rate })),
    color: dept.color,
  }));

  // 비교 테이블 데이터 변환
  const compareEntries: CompareEntry[] = selectedDepts.flatMap((dept) =>
    dept.rates.map((r) => ({
      departmentId: dept.id,
      university: dept.universityName,
      department: dept.name,
      year: r.year,
      applicants: r.applicants,
      accepted: r.accepted,
      rate: r.rate,
      admissionType: r.admissionTypeName,
    }))
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">경쟁률 비교</h1>
        <p className="text-gray-500 text-sm">최대 5개 학과를 선택하여 경쟁률을 비교하세요.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* 학과 선택 패널 */}
        <aside className="w-full lg:w-72 shrink-0">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-3">학과 선택</h2>

            {/* 연도 범위 */}
            <div className="flex gap-2 mb-4">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">시작 연도</label>
                <select
                  value={yearFrom}
                  onChange={(e) => setYearFrom(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  {Array.from({ length: 10 }, (_, i) => 2015 + i).map((y) => (
                    <option key={y} value={y}>{y}년</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">종료 연도</label>
                <select
                  value={yearTo}
                  onChange={(e) => setYearTo(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  {Array.from({ length: 10 }, (_, i) => 2015 + i).map((y) => (
                    <option key={y} value={y}>{y}년</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 학과 검색 */}
            <SearchBar
              onSearch={handleSearch}
              placeholder="학과명 검색..."
              disableAutocomplete
              className="mb-3"
            />

            {/* 검색 결과 */}
            {searching && (
              <div className="text-center py-4">
                <div className="inline-block w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {searchResults.length > 0 && !searching && (
              <ul className="space-y-1 max-h-60 overflow-y-auto">
                {searchResults.map((result) => {
                  const isSelected = selectedDepts.some((d) => d.id === result.id);
                  const isLoading = loadingId === result.id;
                  return (
                    <li key={result.id}>
                      <button
                        onClick={() => handleAddDepartment(result)}
                        disabled={isSelected || isLoading || selectedDepts.length >= 5}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          isSelected
                            ? "bg-blue-50 text-blue-700 cursor-default"
                            : "hover:bg-gray-50 text-gray-900"
                        } disabled:opacity-50`}
                      >
                        <div className="font-medium">{result.name}</div>
                        <div className="text-xs text-gray-400">{result.universityName}</div>
                        {isSelected && <span className="text-xs text-blue-500">✓ 추가됨</span>}
                        {isLoading && <span className="text-xs text-gray-400">로딩 중...</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {searchQuery && searchResults.length === 0 && !searching && (
              <p className="text-sm text-gray-400 text-center py-3">검색 결과가 없습니다.</p>
            )}

            {/* 선택된 학과 목록 */}
            {selectedDepts.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">
                  선택된 학과 ({selectedDepts.length}/5)
                </p>
                <ul className="space-y-1.5">
                  {selectedDepts.map((dept) => (
                    <li key={dept.id} className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: dept.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-900 truncate">{dept.name}</div>
                        <div className="text-xs text-gray-400 truncate">{dept.universityName}</div>
                      </div>
                      <button
                        onClick={() => handleRemoveDepartment(dept.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                        aria-label="삭제"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>

        {/* 비교 결과 영역 */}
        <div className="flex-1 min-w-0">
          {selectedDepts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
              <div className="text-5xl mb-4">⚖️</div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">비교할 학과를 선택하세요</h2>
              <p className="text-gray-500 text-sm">
                왼쪽 검색창에서 학과를 검색하여 추가하면 경쟁률을 비교할 수 있습니다.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 경쟁률 추이 차트 */}
              <RateChart
                datasets={chartDatasets}
                title="연도별 경쟁률 추이"
                height={350}
              />

              {/* 비교 테이블 */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">상세 비교</h3>
                <CompareTable
                  entries={compareEntries}
                  highlightYear={parseInt(yearTo)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={
      <div className="max-w-7xl mx-auto px-4 py-8 text-center">
        <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <CompareContent />
    </Suspense>
  );
}
