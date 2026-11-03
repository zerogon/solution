import {
  MARK_BG,
  MARK_BOWL,
  MARK_FOOT,
  MARK_HIGHLIGHT,
  MARK_STICK_A,
  MARK_STICK_B,
  MARK_VIEWBOX,
} from "@/lib/brand-mark";
import { cn } from "@/lib/utils";

/** 인라인 브랜드 마크. 기하는 `lib/brand-mark.ts`가 PWA 아이콘과 공유한다. */
export function AppMark({ className }: { className?: string }) {
  return (
    <svg viewBox={MARK_VIEWBOX} aria-hidden="true" className={cn("size-8", className)}>
      <rect width="64" height="64" rx="14" fill={MARK_BG} />
      <path d={MARK_HIGHLIGHT} fill="#fff" opacity="0.08" />
      <g fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d={MARK_STICK_A} />
        <path d={MARK_STICK_B} />
        <path d={MARK_BOWL} fill="#fff" fillOpacity="0.18" />
        <path d={MARK_FOOT} opacity="0.85" />
      </g>
    </svg>
  );
}
