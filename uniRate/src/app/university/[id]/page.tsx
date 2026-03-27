import Link from "next/link";
import RateChart, { DepartmentRateData } from "@/components/RateChart";

interface RateData {
  id: number;
  departmentId: number;
  admissionTypeName: string;
  year: number;
  applicants: number;
  accepted: number;
  rate: number;
}

interface DepartmentWithRates {
  id: number;
  name: string;
  category: string;
  universityId: number;
}

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dept?: string }>;
}

// 서버 컴포넌트에서 API 호출
async function fetchUniversityData(universityId: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const res = await fetch(
      `${baseUrl}/api/departments?universityId=${universityId}&limit=50`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function fetchDeptRates(deptId: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const res = await fetch(
      `${baseUrl}/api/rates?departmentId=${deptId}&yearFrom=2019&yearTo=2024`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function UniversityDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { dept: deptId } = await searchParams;

  const [deptsData, ratesData] = await Promise.all([
    fetchUniversityData(id),
    deptId ? fetchDeptRates(deptId) : Promise.resolve(null),
  ]);

  const departments: DepartmentWithRates[] = deptsData?.data ?? [];
  const universityName = ratesData?.university?.name ?? departments[0] ? undefined : "대학교";
  const univName = ratesData?.university?.name ?? `대학 #${id}`;
  const univRegion = ratesData?.university?.region;
  const univType = ratesData?.university?.type;

  const selectedDept = deptId
    ? departments.find((d) => d.id === parseInt(deptId))
    : undefined;

  const rates: RateData[] = ratesData?.data ?? [];

  // 차트 데이터 구성 (전형별로 분리)
  const chartDatasets: DepartmentRateData[] = [];
  const typeMap = new Map<string, { year: number; rate: number }[]>();

  for (const r of rates) {
    if (!typeMap.has(r.admissionTypeName)) {
      typeMap.set(r.admissionTypeName, []);
    }
    typeMap.get(r.admissionTypeName)!.push({ year: r.year, rate: r.rate });
  }

  typeMap.forEach((data, typeName) => {
    chartDatasets.push({ label: typeName, data });
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 브레드크럼 */}
      <nav className="text-sm text-gray-500 mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-blue-600 transition-colors">홈</Link>
        <span>›</span>
        <Link href="/search" className="hover:text-blue-600 transition-colors">검색</Link>
        <span>›</span>
        <span className="text-gray-900">{univName}</span>
      </nav>

      {/* 대학 헤더 */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">{univName}</h1>
            <div className="flex gap-3 text-sm text-gray-500">
              {univRegion && <span>📍 {univRegion}</span>}
              {univType && (
                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full text-xs font-medium">
                  {univType}
                </span>
              )}
            </div>
          </div>
          <Link
            href="/compare"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            비교에 추가 →
          </Link>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* 학과 목록 사이드바 */}
        <aside className="w-full lg:w-64 shrink-0">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-3">학과 목록</h2>
            {departments.length > 0 ? (
              <ul className="space-y-1 max-h-96 overflow-y-auto">
                {departments.map((dept) => (
                  <li key={dept.id}>
                    <Link
                      href={`/university/${id}?dept=${dept.id}`}
                      className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                        deptId === String(dept.id)
                          ? "bg-blue-600 text-white"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <div className="font-medium">{dept.name}</div>
                      <div className={`text-xs ${deptId === String(dept.id) ? "text-blue-200" : "text-gray-400"}`}>
                        {dept.category}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">학과 정보가 없습니다.</p>
            )}
          </div>
        </aside>

        {/* 학과 상세 */}
        <div className="flex-1 min-w-0">
          {selectedDept && rates.length > 0 ? (
            <div className="space-y-6">
              {/* 학과 정보 헤더 */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h2 className="text-xl font-bold text-gray-900">{selectedDept.name}</h2>
                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs mt-1 inline-block">
                  {selectedDept.category}
                </span>
              </div>

              {/* 경쟁률 차트 */}
              {chartDatasets.length > 0 && (
                <RateChart
                  datasets={chartDatasets}
                  title="연도별 경쟁률 추이"
                  height={300}
                />
              )}

              {/* 상세 데이터 테이블 */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-900">연도별 입시 데이터</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-5 py-3 text-sm font-semibold text-gray-600">연도</th>
                        <th className="text-left px-5 py-3 text-sm font-semibold text-gray-600">전형</th>
                        <th className="text-right px-5 py-3 text-sm font-semibold text-gray-600">지원자</th>
                        <th className="text-right px-5 py-3 text-sm font-semibold text-gray-600">합격자</th>
                        <th className="text-right px-5 py-3 text-sm font-semibold text-gray-600">경쟁률</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...rates].sort((a, b) => b.year - a.year).map((rate, index) => (
                        <tr
                          key={rate.id}
                          className={`hover:bg-blue-50 transition-colors ${
                            index < rates.length - 1 ? "border-b border-gray-50" : ""
                          }`}
                        >
                          <td className="px-5 py-3.5 font-medium text-gray-900">{rate.year}년</td>
                          <td className="px-5 py-3.5 text-gray-600">
                            <span className="bg-gray-100 px-2 py-0.5 rounded-full text-xs">
                              {rate.admissionTypeName}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right text-gray-600">
                            {rate.applicants.toLocaleString()}명
                          </td>
                          <td className="px-5 py-3.5 text-right text-gray-600">
                            {rate.accepted.toLocaleString()}명
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <span className="text-blue-600 font-bold">{rate.rate.toFixed(1)}</span>
                            <span className="text-gray-400 text-sm ml-1">: 1</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
              <div className="text-5xl mb-4">📚</div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">학과를 선택하세요</h2>
              <p className="text-gray-500 text-sm">
                왼쪽 학과 목록에서 학과를 선택하면 상세 입시 정보를 확인할 수 있습니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
