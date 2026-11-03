/**
 * 네이버 가격 원문("48,000원", "15,900원~", "변동", "") → 원 단위 정수.
 * 숫자가 하나도 없으면 null (가격 미정). 범위("15,000~20,000원")는 앞 숫자를 쓴다.
 */
export function parsePriceText(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.replace(/,/g, "").match(/\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const krw = new Intl.NumberFormat("ko-KR");

/** 12345 → "12,345원". null → "가격 미정". */
export function formatKrw(n: number | null | undefined): string {
  if (n == null) return "가격 미정";
  return `${krw.format(n)}원`;
}
