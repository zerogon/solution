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

import { freshnessOf } from "@/lib/freshness";

export type AvailabilityTone =
  | "available"
  | "closingSoon"
  /** 예약 가능이라고 기록돼 있지만 마지막 확인이 너무 오래됐다. `freshness.ts` 참조. */
  | "unverified"
  | "soldOut";

/**
 * 행 하나의 표시 등급.
 *
 * 예약 가능 여부와 **신선도는 독립된 두 축**인데, 화면에는 색이 하나뿐이라 여기서
 * 접는다. 접는 방향은 한쪽으로만 정했다 — 낡은 "예약 가능"만 `unverified`로 내리고,
 * 낡은 "마감"은 그대로 마감으로 둔다.
 *
 * 대칭이 아닌 이유는 두 오류의 대가가 다르기 때문이다. 틀린 "예약 가능"은 두 시간을
 * 운전해 가서 방이 없는 것이고, 틀린 "마감"은 화면에서 한 줄 놓치는 것이다.
 * (낡은 마감 행도 엄밀히는 낡은 주장이다. 그래서 지점 헤더가 지점 전체의 나이를
 * 계속 보여준다 — 그 줄이 이 비대칭을 덮는 안전망이다.)
 */
export function toneOf(
  row: { available: boolean; closingSoon: boolean; syncedAt: string | Date },
  now?: number,
): AvailabilityTone {
  if (!row.available) return "soldOut";
  if (freshnessOf(row.syncedAt, now) === "stale") return "unverified";
  return row.closingSoon ? "closingSoon" : "available";
}

export const TONE_LABEL: Record<AvailabilityTone, string> = {
  available: "예약 가능",
  closingSoon: "마감임박",
  // 행 배지는 `checkedLabel(row.syncedAt)`로 "13일 전 확인"을 쓴다. 이 문자열은
  // 나이를 계산할 수 없는 자리(범례·집계)용 폴백이다.
  unverified: "확인 필요",
  soldOut: "마감",
};

/** 목록 행 전체의 표면(테두리 + 배경). */
export const TONE_SURFACE: Record<AvailabilityTone, string> = {
  available: "border-emerald-200 bg-emerald-50/60",
  closingSoon: "border-amber-200 bg-amber-50/60",
  // 파선(dashed)이 핵심이다. `unverified`와 `soldOut`은 둘 다 무채색이라 색만으로는
  // 구별되지 않는데, 이 둘은 "모른다"와 "없다"라서 섞이면 안 된다.
  unverified: "border-dashed border-slate-300 bg-slate-50/60",
  soldOut: "border-border bg-muted/40",
};

/** 상태 배지. */
export const TONE_BADGE: Record<AvailabilityTone, string> = {
  available: "border-emerald-300 bg-emerald-100 text-emerald-800",
  closingSoon: "border-amber-300 bg-amber-100 text-amber-900",
  unverified: "border-dashed border-slate-400 bg-slate-100 text-slate-700",
  soldOut: "border-zinc-300 bg-zinc-100 text-zinc-600",
};

/** 타임라인/목록 좌측의 상태 점. */
export const TONE_DOT: Record<AvailabilityTone, string> = {
  available: "bg-emerald-500",
  closingSoon: "bg-amber-500",
  unverified: "bg-slate-400",
  soldOut: "bg-zinc-300",
};

/** 요약 스탯 타일의 숫자 색. */
export const TONE_TEXT: Record<AvailabilityTone, string> = {
  available: "text-emerald-600",
  closingSoon: "text-amber-600",
  unverified: "text-slate-600",
  soldOut: "text-muted-foreground",
};

/** 확인된 가용 → 마감임박 → 확인 필요 → 마감 순. */
export const TONE_ORDER: Record<AvailabilityTone, number> = {
  available: 0,
  closingSoon: 1,
  unverified: 2,
  soldOut: 3,
};
