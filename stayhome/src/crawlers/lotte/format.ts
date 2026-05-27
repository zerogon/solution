/**
 * Lotte's search form expects YYYY-MM-DD (placeholder — confirm during codegen).
 * Adjust if the real format differs (e.g. YYYY.MM.DD).
 */
export function formatDateKst(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
