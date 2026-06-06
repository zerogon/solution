import Link from "next/link";
import { requireSession } from "@/lib/auth-helpers";
import { SearchView } from "@/components/search/SearchView";

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
      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-5">
          <h1 className="text-lg font-semibold">롯데리조트 객실 조회</h1>
          <p className="text-sm text-muted-foreground">
            날짜와 지점을 선택해 잔여 객실을 확인하세요. 캐시에 없으면 지점 선택 후 ‘최신화’로 조회합니다.
          </p>
        </div>
        <SearchView />
      </main>
    </div>
  );
}
