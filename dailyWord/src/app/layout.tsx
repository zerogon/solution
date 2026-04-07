import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { Nanum_Brush_Script } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const nanumBrushScript = Nanum_Brush_Script({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-korean",
});

export const metadata: Metadata = {
  title: "오늘의 단어",
  description: "오늘 당신에게 필요한 단어를 선택하세요.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={cn("font-sans", geist.variable, nanumBrushScript.variable)}>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
