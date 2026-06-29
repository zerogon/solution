import Link from "next/link";
import Image from "next/image";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { HeaderNav } from "@/components/HeaderNav";
import { logoutAction } from "@/actions/auth";

export async function RoleNav({
  badges,
}: {
  badges?: Record<string, number>;
}) {
  const session = await auth();
  if (!session?.user) return null;
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-5">
          <Link
            href="/"
            aria-label="art'i Piano 홈"
            className="flex items-center transition-opacity hover:opacity-80"
          >
            <Image
              src="/web-logo.png"
              alt="art'i Piano"
              width={416}
              height={103}
              priority
              // mix-blend-multiply: 로고의 흰 배경을 헤더 색에 자연스럽게 녹여 흰 박스 제거
              className="h-10 w-auto mix-blend-multiply"
            />
          </Link>
          <HeaderNav role={session.user.role} badges={badges} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {session.user.name}
          </span>
          <form action={logoutAction}>
            <Button type="submit" size="sm" variant="outline">
              로그아웃
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
