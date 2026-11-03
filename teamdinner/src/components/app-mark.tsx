import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * 앱 로고(펭귄). 원본은 `scripts/assets/logo.jpeg`, 이 PNG는 `npm run icons:generate`가 만든다.
 * 둥근 모서리는 여기서 CSS로 — PWA 아이콘 PNG의 둥근 모서리(22%)와 같은 비율.
 */
export function AppMark({ className }: { className?: string }) {
  return (
    <Image
      src="/icons/logo-256.png"
      alt=""
      width={64}
      height={64}
      unoptimized
      priority
      className={cn("size-8 shrink-0 rounded-[22%]", className)}
    />
  );
}
