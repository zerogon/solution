/** "YYYY-MM" 월 문자열 유효성 검사 정규식 */
export const MONTH_RE = /^\d{4}-\d{2}$/;

/** "YYYY-MM" → delta만큼 이동한 월의 "YYYY-MM" (12월 다음은 익년 1월) */
export function addMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}
