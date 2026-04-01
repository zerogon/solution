import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeToggle } from "@/components/ThemeToggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Databricks Event Scheduler",
  description: "Databricks 행사 개인 스케줄러",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="relative w-6 h-6 flex items-center justify-center">
                <div className="absolute w-3 h-3 bg-primary rounded-sm rotate-45" />
                <div className="absolute w-3 h-3 bg-primary/40 rounded-sm rotate-45 translate-x-[3px] translate-y-[3px]" />
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight leading-none">
                  Databricks
                </h1>
                <p className="text-[10px] text-muted-foreground font-medium tracking-wider uppercase">
                  Event Scheduler
                </p>
              </div>
            </div>
            <ThemeToggle />
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
