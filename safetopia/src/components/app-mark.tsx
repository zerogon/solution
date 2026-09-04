import { cn } from "@/lib/utils";
import {
  MARK_BG,
  MARK_CUP,
  MARK_HANDLE,
  MARK_HIGHLIGHT,
  MARK_LEAF,
  MARK_LEAF_VEIN,
  MARK_VIEWBOX,
} from "@/lib/brand-mark";

/**
 * 앱 브랜드 마크. PWA 아이콘과 동일한 기하(`lib/brand-mark.ts`)를 인라인 SVG로
 * 그린다 — PNG를 로드하지 않으므로 셸 첫 페인트에서 로고 자리가 비지 않고,
 * 서버 컴포넌트에서도 그대로 쓸 수 있다.
 */
export function AppMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      role="img"
      aria-label="Safetopia"
      className={cn("shrink-0", className)}
    >
      <rect width="64" height="64" rx="16" fill={MARK_BG} />
      <path d={MARK_HIGHLIGHT} fill="#fff" opacity="0.08" />
      <g
        fill="none"
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={MARK_CUP} />
        <path d={MARK_HANDLE} />
      </g>
      <path d={MARK_LEAF} fill="#fff" opacity="0.9" />
      <path
        d={MARK_LEAF_VEIN}
        fill="none"
        stroke={MARK_BG}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
