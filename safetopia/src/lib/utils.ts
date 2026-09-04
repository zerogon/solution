import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a "YYYY-MM-DD" string to a UTC-midnight Date.
 *
 * Date convention for the whole app: "YYYY-MM-DD" strings are exchanged at the
 * boundaries, and every Date object representing a calendar day is UTC midnight
 * produced by this function. Used on BOTH the crawl write path
 * (`runResortCrawl` → `upsertInventory`) and the inventory read path so the
 * same `@db.Date` value is produced for equality matching. Consumers must read
 * such Dates with UTC getters only (see `crawlers/lotte/search.ts`).
 */
export function parseDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

/** Today's calendar date in KST as "YYYY-MM-DD", regardless of server timezone. */
export function todayKstIso(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

/**
 * UTC-midnight Date → "YYYY-MM-DD". Inverse of `parseDate`.
 *
 * The crawl scheduler exchanges windows as strings across the Inngest step
 * boundary (step results are JSON, so Dates would come back as full ISO
 * timestamps and silently stop being Dates); this is the conversion back.
 */
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Return a copy of a UTC-midnight Date shifted by `n` days. */
export function addDaysUtc(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

/**
 * Shift a "YYYY-MM-DD" string by `n` days, staying in string space.
 *
 * Goes through `parseDate`/`addDaysUtc` so the UTC-only rule holds — never build
 * a Date from a local-time API here, or DST/timezone shifts will move the day.
 */
export function addDaysIso(s: string, n: number): string {
  return addDaysUtc(parseDate(s), n).toISOString().slice(0, 10);
}

/** Whole days between two "YYYY-MM-DD" strings (`to - from`). */
export function diffDaysIso(from: string, to: string): number {
  return Math.round(
    (parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000,
  );
}

/** First day of the month containing `s`, as "YYYY-MM-DD". */
export function startOfMonthIso(s: string): string {
  return `${s.slice(0, 7)}-01`;
}

/**
 * Shift a "YYYY-MM-DD" by `n` months, clamped to the target month's last day.
 *
 * `setUTCMonth` alone would roll 1/31 + 1 month over into March; clamping keeps
 * the result inside the month the caller asked for.
 */
export function addMonthsIso(s: string, n: number): string {
  const d = parseDate(s);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + n;
  // day 0 of month+1 === last day of month.
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(year, month, Math.min(d.getUTCDate(), lastDay)),
  )
    .toISOString()
    .slice(0, 10);
}

/**
 * Timestamp(진짜 시각) → KST 표시 문자열. 기본 "08.11 18:00".
 *
 * 위의 날짜 유틸들과 달리 이건 달력 날짜가 아니라 **인스턴트**를 다룬다 —
 * `CrawlLog.startedAt` 같은 값이다. `timeZone`을 빼면 포맷이 실행 환경의 로컬
 * 타임존을 따르는데, Vercel 함수는 UTC라 화면에는 9시간 이른 시각이 한국어
 * 로케일로 찍힌다(로케일은 타임존을 정하지 않는다). 서버 컴포넌트가 렌더하므로
 * 브라우저 타임존은 아무 영향이 없다.
 */
export function formatKstDateTime(
  d: Date,
  opts: Intl.DateTimeFormatOptions = {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  },
): string {
  return d.toLocaleString("ko-KR", { ...opts, timeZone: "Asia/Seoul" });
}

const KO_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "2026-08-05" → "8.5(수)". UTC getters only, per the date convention above. */
export function formatKoMd(s: string): string {
  const d = parseDate(s);
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}(${KO_WEEKDAYS[d.getUTCDay()]})`;
}

/** "2026-09-05" ~ "2026-09-06" → "9.5(토)~9.6(일)". 같은 날이면 하나만. */
export function formatKoRange(startIso: string, endIso: string): string {
  return startIso === endIso ? formatKoMd(startIso) : `${formatKoMd(startIso)}~${formatKoMd(endIso)}`;
}

/** "2026-09-05" → "2026.09.05". 표에서 연도까지 보여줄 때. */
export function formatKoDate(iso: string): string {
  return iso.replaceAll("-", ".");
}
