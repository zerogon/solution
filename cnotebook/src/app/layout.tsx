import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import "./globals.css";
import Providers from "@/components/Providers";
import ThemeToggle from "@/components/ThemeToggle";
import LogoutButton from "@/components/LogoutButton";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import InstallPrompt from "@/components/InstallPrompt";
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
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link
          rel="preconnect"
          href="https://cdn.jsdelivr.net"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="bg-surface-50 text-surface-900 antialiased">
        <ServiceWorkerRegister />
        <InstallPrompt />
        <Providers>
          <header className="sticky top-0 z-40 border-b border-surface-200 bg-card/80 backdrop-blur-md">
            <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
              <Link href="/" className="flex items-center gap-2 text-surface-800 transition-colors hover:text-primary-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
                <span className="text-sm font-bold tracking-tight">Character Notebook</span>
              </Link>
              <div className="ml-auto flex items-center gap-1">
                <ThemeToggle />
                {isAuthenticated && <LogoutButton />}
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
