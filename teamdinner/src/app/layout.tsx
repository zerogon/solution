import type { Metadata, Viewport } from "next";

import { ReactQueryProvider } from "@/components/ReactQueryProvider";
import { ServiceWorkerManager } from "@/components/pwa/ServiceWorkerManager";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// 서체는 globals.css의 시스템 스택(Apple SD Gothic Neo / Noto Sans KR / Malgun Gothic …)을 쓴다.
// next/font/google은 빌드·개발 서버가 fonts.googleapis.com에 닿아야 하고, 2026-11-03 Turbopack dev에서
// "next/font/google queries have exactly one entry"로 깨졌다. 외부 의존 없는 쪽을 택했다.

/** `--background: oklch(0.99 0.003 160)`의 sRGB 근사값. manifest.json의 theme_color와 같이 움직여야 한다. */
const THEME_COLOR = "#FAFCFB";

export const metadata: Metadata = {
  title: { default: "회식 메뉴 장바구니", template: "%s · 회식 메뉴" },
  description: "회식 전에 먹고 싶은 메뉴를 미리 담아 두는 팀 장바구니",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/favicon.png",
    shortcut: "/icons/favicon.png",
    apple: { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
  },
  appleWebApp: { capable: true, title: "회식 메뉴", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ko"
      style={{ colorScheme: "light" }}
      className="h-full antialiased"
    >
      <body className="flex min-h-full flex-col">
        <ReactQueryProvider>{children}</ReactQueryProvider>
        <Toaster position="top-center" richColors />
        <ServiceWorkerManager />
      </body>
    </html>
  );
}
