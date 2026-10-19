import Image from "next/image";

import { cn } from "@/lib/utils";
import { MARK_PX, MARK_SRC } from "@/lib/brand-mark";

/**
 * 앱 브랜드 마크 — 원 안의 고양이.
 *
 * 그림은 PWA 아이콘과 같은 원본에서 구운 `/icons/mark.png`(`lib/brand-mark.ts`)이고,
 * 원형 테두리가 그림에 들어 있어 배경을 깔지 않는다.
 * `unoptimized`는 필수다 — 최적화를 켜면 URL이 `/_next/image?url=…`이 되어
 * 서비스워커의 `/icons/` 캐시 규칙과 precache 목록에서 벗어나고, 오프라인 페이지에서
 * 마크가 빈칸이 된다.
 */
export function AppMark({ className }: { className?: string }) {
  return (
    <Image
      src={MARK_SRC}
      alt="Sulki Holiday"
      width={MARK_PX}
      height={MARK_PX}
      unoptimized
      priority
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
