import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Character Notebook",
  description: "작가용 캐릭터 관리 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
