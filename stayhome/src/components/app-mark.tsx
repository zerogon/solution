import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * 앱 브랜드 마크. PWA 아이콘과 같은 원본(`assets/brand/logo.png`)에서 구운
 * `logo-256.png`를 그린다 — 재생성은 `npm run icons:generate`.
 *
 * 예전에는 인라인 SVG라 셸 첫 페인트에 로고 자리가 비지 않았다. 새 로고는 일러스트라
 * SVG로 옮길 수 없고, 대가는 첫 방문의 이미지 한 장(30KB)이다. 서비스워커가 precache
 * 하므로(`sw.js`의 `PRECACHE_URLS`) 이후와 `/offline`에서는 캐시에서 온다.
 * `unoptimized` — 이미 표시 크기에 맞춰 구웠으므로 Vercel 이미지 최적화를 거치지 않는다.
 */
export function AppMark({ className }: { className?: string }) {
  return (
    <Image
      src="/icons/logo-256.png"
      width={256}
      height={256}
      alt="Welfare Stay"
      unoptimized
      className={cn("shrink-0", className)}
    />
  );
}
