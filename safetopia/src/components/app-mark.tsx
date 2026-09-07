import Image from "next/image";

import { cn } from "@/lib/utils";
import { MARK_BG, MARK_CORNER_RATIO, MARK_PX, MARK_SRC } from "@/lib/brand-mark";

/**
 * 앱 브랜드 마크 — 크림 라운드 사각형 안의 로스팅 엠블럼.
 *
 * 그림은 PWA 아이콘과 같은 원본에서 잘라 낸 `/icons/mark.png`이고, 배경·모서리는
 * `lib/brand-mark.ts`의 상수를 그대로 쓴다(홈 화면 아이콘과 어긋나지 않게).
 *
 * 배경 사각형은 CSS로 즉시 칠해지므로 PNG가 도착하기 전에도 로고 자리가 비지 않는다.
 * `unoptimized`는 필수다 — 최적화를 켜면 URL이 `/_next/image?url=…`이 되어
 * 서비스워커의 `/icons/` 캐시 규칙과 precache 목록에서 벗어나고, 오프라인 페이지에서
 * 마크가 빈칸이 된다.
 */
export function AppMark({ className }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Safetopia"
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        className,
      )}
      style={{ backgroundColor: MARK_BG, borderRadius: `${MARK_CORNER_RATIO * 100}%` }}
    >
      <Image
        src={MARK_SRC}
        alt=""
        width={MARK_PX}
        height={MARK_PX}
        unoptimized
        priority
        className="size-[78%] object-contain"
      />
    </span>
  );
}
