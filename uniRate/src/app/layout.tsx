import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UniRate - 실용음악 입시 경쟁률",
  description: "전국 대학교 실용음악 관련 학과의 입시 경쟁률을 한눈에 비교하세요.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {/* 헤더 */}
        <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
          <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-14">
              <a href="/" className="flex items-center gap-2">
                <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-xs">U</span>
                </div>
                <span className="text-lg font-bold text-blue-600">UniRate</span>
              </a>
              <span className="ml-3 text-sm text-gray-400 hidden sm:inline">
                실용음악 입시 경쟁률
              </span>
            </div>
          </nav>
        </header>

        {/* 메인 */}
        <main className="flex-1">{children}</main>

        {/* 푸터 */}
        <footer className="bg-white border-t border-gray-200 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <p className="text-xs text-gray-400 text-center">
              © 2024 UniRate. 데이터 출처: 대학알리미
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
