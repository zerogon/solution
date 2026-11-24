import type { HolidayMap } from "@/lib/holidays-kr";

/**
 * `/api/holidays`의 클라이언트 쪽 호출. 마감일 계산기와 예약확정 메일이 같은
 * react-query 키(`HOLIDAYS_QUERY_KEY`)로 부르므로 한 번 받은 응답을 둘이 나눠 쓴다.
 */

export type HolidayResponse = {
  /** `{ "2026": { "2026-01-01": "신정", … }, … }` */
  years: Record<string, HolidayMap>;
  covered: number[];
  stale?: boolean;
};

export const HOLIDAYS_QUERY_KEY = ["holidays"] as const;

export async function fetchHolidays(): Promise<HolidayResponse> {
  // 파라미터가 없다 — 피드 한 문서가 모든 연도를 덮는다. 덕분에 쿼리 키가 상수가 되고
  // 날짜를 오가며 캐시 엔트리가 늘던 일이 사라진다.
  const res = await fetch("/api/holidays");
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body as HolidayResponse;
}
