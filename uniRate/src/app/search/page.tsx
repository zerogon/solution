"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import SearchBar from "@/components/SearchBar";

// 지역 목록
const REGIONS = ["전체", "서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"];

// 계열 목록
const CATEGORIES = ["전체", "인문", "사회", "교육", "공학", "자연", "의약", "예체능", "사범"];

const PAGE_SIZE = 20;

interface DepartmentResult {
  id: number;
  universityId: number;
  name: string;
  category: string;
  universityName: string;
}

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [region, setRegion] = useState("전체");
  const [category, setCategory] = useState("전체");
  const [page, setPage] = useState(1);

  const [results, setResults] = useState<DepartmentResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // API 호출
  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      if (category !== "전체") params.set("category", category);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));

      const res = await fetch(`/api/departments?${params.toString()}`);
      if (!res.ok) throw new Error("API 오류");
      const json = await res.json();
      setResults(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch {
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [query, category, page]);

  // 쿼리/필터 변경 시 페이지 초기화
  useEffect(() => {
    setPage(1);
  }, [query, region, category]);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  // URL 동기화
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (region !== "전체") params.set("region", region);
    if (category !== "전체") params.set("category", category);
    if (page > 1) params.set("page", String(page));
    router.replace(`/search${params.toString() ? `?${params}` : ""}`, { scroll: false });
  }, [query, region, category, page, router]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">대학/학과 검색</h1>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* 사이드바 필터 */}
        <aside className="w-full lg:w-64 shrink-0">
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">필터</h2>

            {/* 지역 필터 */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">지역</label>
              <div className="flex flex-wrap gap-1.5">
                {REGIONS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRegion(r)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      region === r
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* 계열 필터 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">계열</label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      category === c
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {/* 검색 결과 영역 */}
        <div className="flex-1">
          {/* 검색 바 */}
          <SearchBar
            defaultValue={query}
            onSearch={(q) => setQuery(q)}
            className="mb-4"
          />

          {/* 결과 수 */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">
              {loading ? (
                "검색 중..."
              ) : (
                <>
                  검색 결과{" "}
                  <span className="font-semibold text-gray-900">{total.toLocaleString()}건</span>
                </>
              )}
            </p>
            {total > 0 && !loading && (
              <p className="text-sm text-gray-400">
                {page} / {totalPages} 페이지
              </p>
            )}
          </div>

          {/* 결과 테이블 */}
          {loading ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
              <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-gray-500">검색 중입니다...</p>
            </div>
          ) : results.length > 0 ? (
            <>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-600">대학교</th>
                        <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-600">학과</th>
                        <th className="text-left px-5 py-3.5 text-sm font-semibold text-gray-600 hidden sm:table-cell">계열</th>
                        <th className="text-right px-5 py-3.5 text-sm font-semibold text-gray-600">상세</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((result, index) => (
                        <tr
                          key={result.id}
                          className={`hover:bg-blue-50 transition-colors ${
                            index < results.length - 1 ? "border-b border-gray-50" : ""
                          }`}
                        >
                          <td className="px-5 py-4 font-medium text-gray-900">{result.universityName}</td>
                          <td className="px-5 py-4 text-gray-700">{result.name}</td>
                          <td className="px-5 py-4 text-gray-500 hidden sm:table-cell">
                            <span className="bg-gray-100 px-2 py-0.5 rounded-full text-xs">{result.category}</span>
                          </td>
                          <td className="px-5 py-4 text-right">
                            <Link
                              href={`/university/${result.universityId}?dept=${result.id}`}
                              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                            >
                              상세 →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 페이지네이션 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    ← 이전
                  </button>

                  {/* 페이지 번호 */}
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 7) {
                      pageNum = i + 1;
                    } else if (page <= 4) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 3) {
                      pageNum = totalPages - 6 + i;
                    } else {
                      pageNum = page - 3 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                          pageNum === page
                            ? "bg-blue-600 text-white"
                            : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
                  >
                    다음 →
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-gray-500">검색 결과가 없습니다.</p>
              <p className="text-sm text-gray-400 mt-1">다른 검색어나 필터를 사용해보세요.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="max-w-7xl mx-auto px-4 py-8 text-center">
        <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
