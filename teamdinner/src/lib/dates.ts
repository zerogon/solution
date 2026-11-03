/**
 * 날짜 규약: 회식 날짜는 'YYYY-MM-DD' 문자열로만 주고받고, Date로 바꿀 때는 UTC 자정으로 만든다.
 * 로컬 타임존 API를 쓰면 서버(UTC)와 브라우저(KST)에서 하루씩 밀린다. (stayhome과 같은 규약)
 */

/** 오늘의 달력 날짜(KST) — 실행 환경 타임존과 무관. */
export function todayKstIso(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export function parseIsoDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

const KO_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "2026-11-14" → "11.14(금)". UTC getter만 쓴다. */
export function formatKoDate(s: string): string {
  const d = parseIsoDate(s);
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}(${KO_WEEKDAYS[d.getUTCDay()]})`;
}

/** "2026-11-14" → "2026.11.14(금)". 연도가 다른 지난 회식용. */
export function formatKoDateWithYear(s: string): string {
  return `${s.slice(0, 4)}.${formatKoDate(s)}`;
}

/** 두 'YYYY-MM-DD' 사이의 일수(`to - from`). */
export function diffDays(from: string, to: string): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / 86_400_000);
}

/** "오늘" / "내일" / "D-3" / "3일 전". */
export function dDayLabel(eventDate: string, today: string): string {
  const n = diffDays(today, eventDate);
  if (n === 0) return "오늘";
  if (n === 1) return "내일";
  if (n > 0) return `D-${n}`;
  return `${-n}일 전`;
}

export function isPast(eventDate: string, today: string): boolean {
  return eventDate < today;
}
