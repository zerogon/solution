import { parseIcsHolidays, type ParsedFeed } from "@/lib/holidays-ical";
import { holidayOracle, type HolidayMap, type HolidayOracle } from "@/lib/holidays-kr";

/**
 * Google 공개 캘린더의 한국 공휴일 — 서버 측 단일 출처.
 *
 * `/api/holidays` 라우트(P2 캘린더·서비스워커 SWR)와 서버 컴포넌트/액션(연차 일수 계산)이
 * **같은 캐시**를 본다. 라우트 안에만 두면 액션이 자기 서버로 HTTP를 쏴야 한다.
 *
 * ## 왜 서버를 거치나
 * calendar.google.com은 CORS를 열어주지 않고, 100KB짜리 문서를 파싱해 10KB로 줄이는
 * 일을 브라우저마다 반복시킬 이유가 없다.
 *
 * ## 실패 방향
 * 공휴일을 적게 세면 연차가 **더 많이 차감**된다(휴일인 날을 근무일로 세니까). 조용히
 * 틀리면 직원이 손해를 보는 쪽이라, 판정 불가 연도는 `covered`에서 빼고 호출자가
 * 신청을 막는다(`computeLeaveDays`의 `uncovered`).
 */

const FEED_URL =
  "https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics";
// ⚠️ `%23`(#)·`%40`(@)은 **리터럴에 그대로** 둔다. `URLSearchParams`로 조립하면
// `#`가 경로를 잘라 전혀 다른 URL이 된다.

/** 캐시 수명. 임시공휴일(선거일 등)이 공고돼도 하루 두 번이면 충분히 따라간다. */
const TTL_MS = 12 * 60 * 60 * 1000;

/**
 * 커버리지의 미래 상한 = **올해 + 1**. 먼 연도는 대체공휴일이 미확정이라 불완전하다
 * (형제 앱 실측: 2028년 설 연휴·추석 대체휴일 누락).
 */
const horizonYear = () => new Date().getUTCFullYear() + 1;

export interface HolidayPayload {
  years: Record<string, HolidayMap>;
  covered: number[];
  stale?: boolean;
}

let cache: { fetchedAt: number; payload: HolidayPayload } | null = null;

export class HolidayUpstreamError extends Error {}
export class HolidayLabelMismatchError extends Error {}

function toPayload(parsed: ParsedFeed): HolidayPayload {
  const covered = parsed.covered.filter((y) => y <= horizonYear());
  const years: Record<string, HolidayMap> = {};
  for (const y of covered) years[String(y)] = parsed.byYear[String(y)] ?? {};
  return { years, covered };
}

async function fetchFeed(): Promise<HolidayPayload> {
  let res: Response;
  try {
    res = await fetch(FEED_URL, {
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "text/calendar" },
      // 이 모듈이 TTL의 주인이다. Next 데이터 캐시가 사본을 들면 12시간 창이 관측 불가능해진다.
      cache: "no-store",
    });
  } catch (e) {
    throw new HolidayUpstreamError(`요청 실패: ${e instanceof Error ? e.message : String(e)}`);
  }

  const text = await res.text();
  if (!res.ok) throw new HolidayUpstreamError(`HTTP ${res.status} — ${text.slice(0, 200)}`);

  // 로그인·동의 HTML이 조용히 0건으로 파싱되는 것을 막는다.
  if (!text.trimStart().replace(/^﻿/, "").startsWith("BEGIN:VCALENDAR")) {
    throw new HolidayUpstreamError(`iCalendar가 아닌 응답 — ${text.slice(0, 200)}`);
  }

  const parsed = parseIcsHolidays(text);
  if (parsed.stats.events === 0) throw new HolidayUpstreamError("VEVENT가 하나도 없다");

  const payload = toPayload(parsed);
  // 라벨 가드 — 구글이 `공휴일` 표기를 바꾸면 여기서 시끄럽게 죽는다.
  if (payload.covered.length === 0) {
    console.warn("[holidays] 라벨 불일치 — 관측된 DESCRIPTION:", JSON.stringify(parsed.stats.labels));
    throw new HolidayLabelMismatchError(
      `공휴일로 분류된 연도가 없다. 관측된 라벨: ${JSON.stringify(parsed.stats.labels)}`,
    );
  }
  return payload;
}

/**
 * 공휴일 데이터. 신선한 캐시 → 라이브 → 만료 캐시(stale) 순. 아무것도 없으면 던진다.
 */
export async function getKoreanHolidays(): Promise<HolidayPayload> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.payload;

  try {
    const payload = await fetchFeed();
    cache = { fetchedAt: Date.now(), payload };
    return payload;
  } catch (e) {
    // 만료된 캐시라도 있으면 그걸 준다 — 공휴일은 소급해 바뀌지 않는다.
    if (cache) {
      console.warn("[holidays] 갱신 실패, 만료 캐시 사용:", e instanceof Error ? e.message : e);
      return { ...cache.payload, stale: true };
    }
    throw e;
  }
}

/**
 * 오라클 — 실패해도 던지지 않는다. 피드가 죽으면 `covers()`가 전부 false인 오라클을
 * 돌려주고, 호출자는 "판정 불가"로 신청을 막는다. 화면은 여전히 그려진다.
 */
export async function getHolidayOracle(): Promise<{ oracle: HolidayOracle; payload: HolidayPayload | null }> {
  try {
    const payload = await getKoreanHolidays();
    return { oracle: holidayOracle(payload.covered, payload.years), payload };
  } catch (e) {
    console.warn("[holidays] upstream failed:", e instanceof Error ? e.message : e);
    return { oracle: holidayOracle([], {}), payload: null };
  }
}
