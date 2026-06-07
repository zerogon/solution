import Link from "next/link";
import { Music } from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { HeaderNav } from "@/components/HeaderNav";
import { ThemeToggle } from "@/components/ThemeToggle";
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
            className="flex items-center gap-2 font-heading text-base font-semibold tracking-tight"
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Music className="size-4" />
            </span>
            PianoFlow
          </Link>
          <HeaderNav role={session.user.role} badges={badges} />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {session.user.name}
          </span>
          <ThemeToggle />
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
