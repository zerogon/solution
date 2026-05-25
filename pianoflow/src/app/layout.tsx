import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import "./globals.css";

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PianoFlow — 피아노 학원 레슨 예약",
  description: "약 50명 규모 피아노 학원의 레슨 예약 PWA",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PianoFlow",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ko"
      className={`${notoSansKr.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster richColors position="top-center" />
        <PwaInstallPrompt />
      </body>
    </html>
  );
}
