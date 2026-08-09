import type { Metadata, Viewport } from "next";
import { Geist_Mono, Noto_Sans_KR } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { ServiceWorkerManager } from "@/components/pwa/ServiceWorkerManager";
import { ReactQueryProvider } from "@/components/ReactQueryProvider";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// 숫자 전용 서체. 날짜·건수·소요시간처럼 자릿수가 바뀌는 값에 `tabular-nums`와
// 함께 써서 값이 갱신될 때 폭이 흔들리지 않게 한다.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** `--background` 토큰 oklch(0.99 0.002 220)의 sRGB 값. 둘은 같이 움직여야 한다. */
const THEME_COLOR = "#FAFCFD";

export const metadata: Metadata = {
  title: "Welfare Stay — 제휴 리조트 조회",
  description: "사내 제휴 리조트 통합 조회 시스템",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/favicon.png",
    shortcut: "/icons/favicon.png",
    apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
  appleWebApp: {
    capable: true,
    title: "Welfare Stay",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // 하단 탭바가 홈 인디케이터 영역까지 그려질 수 있게 한다
  // (BottomTabBar가 env(safe-area-inset-bottom)으로 여백을 보정).
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      // 라이트 고정. 다크 토큰은 globals.css에 준비돼 있지만 활성화하지 않는다.
      style={{ colorScheme: "light" }}
      className={`${notoSansKr.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <ReactQueryProvider>{children}</ReactQueryProvider>
        <Toaster position="top-center" richColors theme="light" />
        <ServiceWorkerManager />
      </body>
    </html>
  );
}
