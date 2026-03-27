import Link from "next/link";

// 인기 학과 예시 데이터 (실제 데이터는 API 연동 후 대체)
const popularDepartments = [
  { rank: 1, university: "서울대학교", department: "의학과", rate: 45.2, year: 2024 },
  { rank: 2, university: "연세대학교", department: "의학과", rate: 42.8, year: 2024 },
  { rank: 3, university: "고려대학교", department: "의학과", rate: 38.5, year: 2024 },
  { rank: 4, university: "성균관대학교", department: "의학과", rate: 35.1, year: 2024 },
  { rank: 5, university: "서울대학교", department: "컴퓨터공학부", rate: 28.7, year: 2024 },
  { rank: 6, university: "연세대학교", department: "경영학과", rate: 26.3, year: 2024 },
  { rank: 7, university: "고려대학교", department: "경영학과", rate: 24.9, year: 2024 },
  { rank: 8, university: "서울대학교", department: "법학과", rate: 22.4, year: 2024 },
  { rank: 9, university: "한양대학교", department: "의학과", rate: 21.8, year: 2024 },
  { rank: 10, university: "성균관대학교", department: "반도체시스템공학", rate: 20.5, year: 2024 },
];

// 서비스 주요 기능
const features = [
  {
    icon: "🔍",
    title: "빠른 검색",
    description: "전국 대학교 및 학과를 빠르게 검색하고 입시 경쟁률을 확인하세요.",
  },
  {
    icon: "📊",
    title: "연도별 추이",
    description: "연도별 경쟁률 변화를 차트로 한눈에 파악하세요.",
  },
  {
    icon: "⚖️",
    title: "학과 비교",
    description: "여러 대학의 동일 학과 또는 다른 학과를 나란히 비교하세요.",
  },
];

// 사용 방법 단계
const steps = [
  { step: "01", title: "학교 또는 학과 검색", description: "검색창에 대학명이나 학과명을 입력하세요." },
  { step: "02", title: "상세 정보 확인", description: "연도별 경쟁률, 지원자 수, 합격자 수를 확인하세요." },
  { step: "03", title: "비교 분석", description: "관심 학과를 추가하여 경쟁률을 비교 분석하세요." },
];

export default function HomePage() {
  return (
    <div className="bg-gray-50">
      {/* 히어로 섹션 */}
      <section className="bg-gradient-to-br from-blue-600 to-blue-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-3xl mx-auto text-center">
            <h1 className="text-3xl md:text-5xl font-bold mb-4 leading-tight">
              대학 입시 경쟁률,
              <br />
              한눈에 비교하세요
            </h1>
            <p className="text-blue-100 text-lg md:text-xl mb-10">
              전국 대학교 학과별 입시 경쟁률을 연도별로 조회하고 비교합니다.
            </p>

            {/* 검색 입력 */}
            <div className="flex flex-col sm:flex-row gap-3 max-w-xl mx-auto">
              <input
                type="text"
                placeholder="대학명 또는 학과명을 입력하세요..."
                className="flex-1 px-5 py-3.5 rounded-xl text-gray-900 text-base shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <Link
                href="/search"
                className="bg-white text-blue-600 font-semibold px-6 py-3.5 rounded-xl shadow-lg hover:bg-blue-50 transition-colors whitespace-nowrap"
              >
                검색하기
              </Link>
            </div>

            {/* 빠른 검색 태그 */}
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <span className="text-blue-200 text-sm mr-1">인기 검색어:</span>
              {["의학과", "컴퓨터공학", "경영학과", "간호학과", "법학과"].map((keyword) => (
                <Link
                  key={keyword}
                  href={`/search?q=${encodeURIComponent(keyword)}`}
                  className="bg-blue-500 bg-opacity-50 hover:bg-opacity-70 text-white text-sm px-3 py-1 rounded-full transition-colors"
                >
                  {keyword}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 주요 기능 소개 */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 mb-3">
            주요 기능
          </h2>
          <p className="text-gray-500 text-center mb-12">
            UniRate로 입시 정보를 더 스마트하게 파악하세요
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-gray-50 rounded-2xl p-8 text-center hover:shadow-md transition-shadow"
              >
                <div className="text-4xl mb-4">{feature.icon}</div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 인기 학과 TOP 10 */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
                🏆 인기 학과 TOP 10
              </h2>
              <p className="text-gray-500 mt-1">2024년 기준 경쟁률 상위 학과</p>
            </div>
            <Link
              href="/search"
              className="text-blue-600 hover:text-blue-700 font-medium text-sm"
            >
              전체 보기 →
            </Link>
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600 w-16">
                      순위
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">
                      대학교
                    </th>
                    <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">
                      학과
                    </th>
                    <th className="text-right px-6 py-4 text-sm font-semibold text-gray-600 w-32">
                      경쟁률
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {popularDepartments.map((item, index) => (
                    <tr
                      key={item.rank}
                      className={`border-b border-gray-50 hover:bg-blue-50 transition-colors ${
                        index === popularDepartments.length - 1 ? "border-0" : ""
                      }`}
                    >
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
                            item.rank <= 3
                              ? "bg-blue-600 text-white"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {item.rank}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-900 font-medium">{item.university}</td>
                      <td className="px-6 py-4 text-gray-600">{item.department}</td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-blue-600 font-bold text-lg">
                          {item.rate.toFixed(1)}
                        </span>
                        <span className="text-gray-400 text-sm ml-1">: 1</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* 사용 방법 */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 mb-3">
            이용 방법
          </h2>
          <p className="text-gray-500 text-center mb-12">3단계로 간편하게 조회하세요</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {steps.map((step, index) => (
              <div key={step.step} className="flex flex-col items-center text-center relative">
                <div className="w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xl mb-4 shadow-md">
                  {step.step}
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-7 left-[calc(50%+2rem)] w-[calc(100%-4rem)] h-0.5 bg-blue-200" />
                )}
                <h3 className="text-lg font-bold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>

          {/* CTA 버튼 */}
          <div className="text-center mt-12">
            <Link
              href="/search"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-4 rounded-xl transition-colors shadow-md"
            >
              지금 바로 검색하기
              <span>→</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
