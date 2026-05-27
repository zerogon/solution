import Link from "next/link";
import { requireSession } from "@/lib/auth-helpers";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const session = await requireSession();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="font-semibold">Welfare Stay</div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{session.user.email}</span>
            <Link
              href="/admin/accounts"
              className="text-muted-foreground underline-offset-4 hover:underline"
            >
              관리
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>통합 검색 (Phase D에서 구현 예정)</CardTitle>
            <CardDescription>
              현재는 인프라 구축 단계입니다. 먼저 관리 페이지에서 리조트 자격증명을 등록하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Link href="/admin/accounts" className={cn(buttonVariants())}>
              계정 관리
            </Link>
            <Link
              href="/admin/crawl-logs"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              크롤링 로그
            </Link>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
