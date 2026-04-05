import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { BookOpen, FileText } from "lucide-react";
import "./globals.css";
import Providers from "@/components/Providers";
import ThemeToggle from "@/components/ThemeToggle";
import LogoutButton from "@/components/LogoutButton";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import PageTransition from "@/components/PageTransition";

import { verifySessionToken, AUTH_COOKIE_NAME } from "@/lib/auth";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#b45309",
};

export const metadata: Metadata = {
  title: "Character Notebook",
  description: "작가용 캐릭터 관리 서비스",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "CNote",
  },
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  const isAuthenticated = token ? await verifySessionToken(token) : false;

  return (
    <html lang="ko" suppressHydrationWarning className="font-sans">
      <head>
        {/* Noto Sans KR — full Korean glyph coverage via Google Fonts CSS2 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700&family=Noto+Serif+KR:wght@500;600;700&display=swap"
        />
      </head>
      <body className="relative min-h-svh bg-background text-foreground antialiased">
        <ServiceWorkerRegister />
        {/* Ambient sage gradient — subtle color tint to the whole app */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-x-0 top-0 z-0 h-[520px] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,oklch(0.94_0.04_150/0.7),transparent_70%)] dark:bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,oklch(0.32_0.07_145/0.25),transparent_70%)]"
        />
        <Providers>
          <header className="sticky top-0 z-40 border-b border-border/70 bg-background/70 backdrop-blur-xl">
            <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
              <Link
                href="/"
                className="group flex items-center gap-2.5 text-foreground transition-colors"
              >
                <span className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-primary/75 text-primary-foreground shadow-sm shadow-primary/25 transition-transform group-hover:scale-[1.04]">
                  <BookOpen className="size-4" strokeWidth={2.2} />
                </span>
                <span className="hidden text-sm font-semibold tracking-[-0.01em] sm:inline">
                  Character Notebook
                </span>
              </Link>
              {isAuthenticated && (
                <nav className="flex items-center gap-1">
                  <Link
                    href="/writing"
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    aria-label="원고"
                  >
                    <FileText className="size-3.5" />
                    <span className="hidden sm:inline">원고</span>
                  </Link>
                </nav>
              )}
              <div className="ml-auto flex items-center gap-0.5">
                <ThemeToggle />
                {isAuthenticated && <LogoutButton />}
              </div>
            </div>
          </header>
          <main className="relative z-10 mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-12">
            <PageTransition>{children}</PageTransition>
          </main>
        </Providers>
      </body>
    </html>
  );
}
