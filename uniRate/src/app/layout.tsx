import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "UniRate - 대학 입시 경쟁률 조회",
  description: "전국 대학교 학과별 연도별 입시 경쟁률을 조회하고 비교하세요.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {/* 네비게이션 바 */}
        <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* 로고 */}
              <Link href="/" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">U</span>
                </div>
                <span className="text-xl font-bold text-blue-600">UniRate</span>
              </Link>

              {/* 네비게이션 링크 */}
              <div className="hidden md:flex items-center gap-6">
                <Link
                  href="/search"
                  className="text-gray-600 hover:text-blue-600 font-medium transition-colors"
                >
                  대학/학과 검색
                </Link>
                <Link
                  href="/compare"
                  className="text-gray-600 hover:text-blue-600 font-medium transition-colors"
                >
                  경쟁률 비교
                </Link>
              </div>

              {/* 모바일 메뉴 아이콘 */}
              <div className="md:hidden flex items-center gap-3">
                <Link
                  href="/search"
                  className="text-sm text-gray-600 hover:text-blue-600 font-medium"
                >
                  검색
                </Link>
                <Link
                  href="/compare"
                  className="text-sm text-gray-600 hover:text-blue-600 font-medium"
                >
                  비교
                </Link>
              </div>
            </div>
          </nav>
        </header>

        {/* 메인 콘텐츠 */}
        <main className="flex-1">{children}</main>

        {/* 푸터 */}
        <footer className="bg-white border-t border-gray-200 mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
                    <span className="text-white font-bold text-xs">U</span>
                  </div>
                  <span className="font-bold text-blue-600">UniRate</span>
                </div>
                <p className="text-sm text-gray-500">
                  대한민국 전국 대학교 입시 경쟁률 조회 서비스
                </p>
              </div>
              <div className="flex gap-6 text-sm text-gray-500">
                <Link href="/search" className="hover:text-blue-600 transition-colors">
                  대학/학과 검색
                </Link>
                <Link href="/compare" className="hover:text-blue-600 transition-colors">
                  경쟁률 비교
                </Link>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-gray-100 text-xs text-gray-400 text-center">
              © 2024 UniRate. 데이터 출처: 대학알리미
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
