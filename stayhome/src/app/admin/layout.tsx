import Link from "next/link";
import { ReactNode } from "react";
import { requireSession } from "@/lib/auth-helpers";
import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="font-semibold">
              Welfare Stay
            </Link>
            <Link href="/admin/accounts" className="text-muted-foreground hover:text-foreground">
              계정 관리
            </Link>
            <Link href="/admin/crawl-logs" className="text-muted-foreground hover:text-foreground">
              크롤링 로그
            </Link>
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{session.user.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <Button type="submit" variant="ghost" size="sm">
                로그아웃
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
