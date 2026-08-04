/**
 * 잔여 객실 상태색.
 *
 * 여기만 의도적으로 테마 토큰(`--primary` 등)을 쓰지 않고 Tailwind 리터럴 팔레트를
 * 쓴다. 이 색들은 브랜드가 아니라 **의미**색이기 때문이다 — primary 틸을 "예약 가능"에
 * 쓰면 브랜드색과 상태색이 같아져서 "이 틸이 강조인가 가용인가"가 구분되지 않는다.
 * (형제 앱 pianoflow의 SlotGrid도 같은 이유로 슬롯 상태색만 팔레트 리터럴을 쓴다.)
 *
 * 클래스 문자열은 Tailwind JIT가 소스에서 그대로 발견할 수 있어야 하므로 반드시
 * 정적 리터럴로 둔다. `bg-${color}-50` 같은 동적 조합 금지.
 */

export type AvailabilityTone = "available" | "closingSoon" | "soldOut";

export function toneOf(row: {
  available: boolean;
  closingSoon: boolean;
}): AvailabilityTone {
  if (!row.available) return "soldOut";
  return row.closingSoon ? "closingSoon" : "available";
}

export const TONE_LABEL: Record<AvailabilityTone, string> = {
  available: "예약 가능",
  closingSoon: "마감임박",
  soldOut: "마감",
};

/** 목록 행 전체의 표면(테두리 + 배경). */
export const TONE_SURFACE: Record<AvailabilityTone, string> = {
  available: "border-emerald-200 bg-emerald-50/60",
  closingSoon: "border-amber-200 bg-amber-50/60",
  soldOut: "border-border bg-muted/40",
};

/** 상태 배지. */
export const TONE_BADGE: Record<AvailabilityTone, string> = {
  available: "border-emerald-300 bg-emerald-100 text-emerald-800",
  closingSoon: "border-amber-300 bg-amber-100 text-amber-900",
  soldOut: "border-zinc-300 bg-zinc-100 text-zinc-600",
};

/** 타임라인/목록 좌측의 상태 점. */
export const TONE_DOT: Record<AvailabilityTone, string> = {
  available: "bg-emerald-500",
  closingSoon: "bg-amber-500",
  soldOut: "bg-zinc-300",
};

/** 요약 스탯 타일의 숫자 색. */
export const TONE_TEXT: Record<AvailabilityTone, string> = {
  available: "text-emerald-600",
  closingSoon: "text-amber-600",
  soldOut: "text-muted-foreground",
};

/** 마감된 객실은 뒤로 — 예약 가능 → 마감임박 → 마감 순. */
export const TONE_ORDER: Record<AvailabilityTone, number> = {
  available: 0,
  closingSoon: 1,
  soldOut: 2,
};
