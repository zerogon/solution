import Link from "next/link";

import { AppMark } from "@/components/app-mark";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <AppMark className="size-14 opacity-60" />
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">회식을 찾을 수 없습니다</h1>
        <p className="max-w-xs text-sm text-muted-foreground">링크가 잘못됐거나 삭제된 회식입니다.</p>
      </div>
      <Button render={<Link href="/" />}>새 회식 만들기</Button>
    </main>
  );
}
