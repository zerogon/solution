// 선생님별 강조색. 이름순 목록의 인덱스로 배정해 한 화면 안에서 항상 서로 다른 색을 보장한다.
// blue(내 예약)/zinc(마감·불가)는 SlotGrid의 상태 의미색이므로 팔레트에서 제외.
export const TEACHER_ACCENTS = [
  "emerald",
  "violet",
  "amber",
  "rose",
  "cyan",
] as const;

export type TeacherAccent = (typeof TEACHER_ACCENTS)[number];

export function teacherAccentAt(index: number): TeacherAccent {
  return TEACHER_ACCENTS[index % TEACHER_ACCENTS.length];
}

/** 예약 가능 슬롯 버튼 스킨 (SlotGrid available 상태) */
export const ACCENT_AVAILABLE: Record<TeacherAccent, string> = {
  emerald:
    "bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100",
  violet: "bg-violet-50 text-violet-900 border-violet-300 hover:bg-violet-100",
  amber: "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100",
  rose: "bg-rose-50 text-rose-900 border-rose-300 hover:bg-rose-100",
  cyan: "bg-cyan-50 text-cyan-900 border-cyan-300 hover:bg-cyan-100",
};

/** 선생님 카드 등에 붙는 색상 점 */
export const ACCENT_DOT: Record<TeacherAccent, string> = {
  emerald: "bg-emerald-400",
  violet: "bg-violet-400",
  amber: "bg-amber-400",
  rose: "bg-rose-400",
  cyan: "bg-cyan-400",
};
