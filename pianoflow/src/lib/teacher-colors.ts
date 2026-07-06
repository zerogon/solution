/**
 * 선생님 시리즈 색 매핑 — 대시보드 전역(타임라인 도트·추이 차트)에서 공유.
 * 인덱스 = 전체 선생님 name asc 순번. chart-4는 저채도 회색이라 맨 뒤(잔여/기타용).
 */

/** SVG stroke/fill 등 인라인 스타일용 CSS 변수 */
export const TEACHER_CHART_VARS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-5)",
  "var(--chart-4)",
] as const;

/** Tailwind JIT 인식을 위해 정적 리터럴 유지 — 동적 조립 금지 */
export const TEACHER_DOT_CLASSES = [
  "bg-chart-1",
  "bg-chart-2",
  "bg-chart-3",
  "bg-chart-5",
  "bg-chart-4",
] as const;

export function teacherColorVar(index: number): string {
  return TEACHER_CHART_VARS[index % TEACHER_CHART_VARS.length];
}

export function teacherDotClass(index: number): string {
  return TEACHER_DOT_CLASSES[index % TEACHER_DOT_CLASSES.length];
}
