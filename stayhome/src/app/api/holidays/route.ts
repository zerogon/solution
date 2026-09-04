import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth-helpers";
import { parseIcsHolidays, type ParsedFeed } from "@/lib/holidays-ical";
import type { HolidayMap } from "@/lib/holidays-kr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Google 공개 캘린더의 한국 공휴일 프록시.
 *
 * 사이드바 마감일 계산기(`DeadlineCalculator`)가 유일한 소비자다.
 * 파싱은 전부 `src/lib/holidays-ical.ts`에 있다 — 디버그 스크립트가 **같은 함수**를
 * 오프라인으로 돌려야 하기 때문이고, 그 이유는 그 파일 헤더에 있다.
 *
 * ## 왜 서버를 거치나
 * 키가 필요 없어졌는데도 프록시가 남는 이유 둘: calendar.google.com은 CORS를 열어주지
 * 않고, 100KB짜리 문서를 파싱해 10KB로 줄이는 일을 브라우저마다 반복시킬 이유가 없다.
 *
 * 세션 게이트는 `proxy.ts` + `auth.config.ts`가 자동으로 건다(`/api/holidays`는
 * `isPublic`에 없다). 그래도 다른 라우트들과 같이 여기서 한 번 더 부른다.
 *
 * ## 파라미터가 없다
 * 한 문서가 모든 연도를 덮으므로 연도를 고를 이유가 없다. 덕분에 클라이언트의
 * react-query 키가 상수가 되고, 날짜를 오가며 캐시 엔트리가 늘던 일이 사라진다.
 */

const FEED_URL =
  "https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics";
// ⚠️ `%23`(#)·`%40`(@)은 **리터럴에 그대로** 둔다. `URLSearchParams`나
// `encodeURIComponent`로 조립하면 `#`가 경로를 잘라 전혀 다른 URL이 된다.

/**
 * 캐시 수명. 무한 캐시로 두면 임시공휴일(선거일 등)이 공고돼도 영원히 못 본다.
 * 반대로 짧으면 워밍 인스턴스가 같은 100KB를 반복해 사 온다. 하루 두 번이면 충분하다.
 */
const TTL_MS = 12 * 60 * 60 * 1000;

/**
 * 커버리지의 미래 상한 = **올해 + 1**.
 *
 * 피드는 2031년까지 주지만 먼 연도는 불완전하다 — 실측(2026-08-30)에서 2028년에
 * 설날 연휴 1/25이 없고, 추석(10/2~4)이 개천절(10/3)과 겹치는데 대체공휴일 10/5도 없다.
 * 둘 다 **휴일을 적게 세는** = 마감일을 뒤로 미는 방향이라, 이 기능이 막으려는 실패다.
 * (구글의 결함이라기보다 어느 소스도 미확정 대체공휴일은 알 수 없다는 문제에 가깝다.)
 *
 * 상한을 **서버 한 곳에서** 적용해 오라클과 달력이 같은 숫자를 본다. 사본을 두면
 * 증상이 "달력에서는 고를 수 있는데 계산은 안 되는 날짜"다.
 */
const horizonYear = () => new Date().getUTCFullYear() + 1;

interface Payload {
  years: Record<string, HolidayMap>;
  covered: number[];
}

let cache: { fetchedAt: number; payload: Payload } | null = null;

/** 업스트림이 답을 못 준 경우. 만료 캐시 폴백 판단을 위해 타입을 따로 둔다. */
class UpstreamError extends Error {}

/** 파싱은 됐는데 공휴일로 분류된 연도가 없다 — 라벨 표기가 바뀌었다는 뜻. */
class LabelMismatchError extends Error {}

function toPayload(parsed: ParsedFeed): Payload {
  // 바닥을 통과한 연도 중 지평선 안쪽만 남긴다. 두 이유(데이터 부족 / 정책 상한)가
  // 모두 "covered에 없다"로 합쳐지고, 클라이언트에게는 그 구분이 필요 없다 —
  // 어느 쪽이든 답은 "계산 불가"다.
  const covered = parsed.covered.filter((y) => y <= horizonYear());
  const years: Record<string, HolidayMap> = {};
  for (const y of covered) years[String(y)] = parsed.byYear[String(y)] ?? {};
  return { years, covered };
}

async function fetchFeed(): Promise<Payload> {
  let res: Response;
  try {
    res = await fetch(FEED_URL, {
      // 100KB라 특일정보 시절의 5초보다 여유를 준다.
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "text/calendar" },
      // 이 라우트가 TTL의 주인이다. Next 데이터 캐시가 사본을 들면 위의 12시간 창이
      // 관측 불가능해진다.
      cache: "no-store",
    });
  } catch (e) {
    throw new UpstreamError(`요청 실패: ${e instanceof Error ? e.message : String(e)}`);
  }

  const text = await res.text();
  if (!res.ok) throw new UpstreamError(`HTTP ${res.status} — ${text.slice(0, 200)}`);

  // 옛 소스의 "JSON을 요청했는데 XML이 옴" 함정의 대응물. 로그인·동의 HTML이 조용히
  // 0건으로 파싱되는 것을 막는다(그 침묵이 정확히 위험한 방향이다).
  if (!text.trimStart().replace(/^﻿/, "").startsWith("BEGIN:VCALENDAR")) {
    throw new UpstreamError(`iCalendar가 아닌 응답 — ${text.slice(0, 200)}`);
  }

  const parsed = parseIcsHolidays(text);

  // 문서 층 전부-아니면-전무: 이벤트가 하나도 없으면 200에 빈 답을 주지 않는다.
  if (parsed.stats.events === 0) {
    throw new UpstreamError("VEVENT가 하나도 없다");
  }

  const payload = toPayload(parsed);

  // 라벨 가드. 구글이 `공휴일` 표기를 바꾸면 필터가 아무것도 매치하지 않고, 그건
  // "휴일 없는 해"처럼 보인 채 주말만 건너뛴 늦은 날짜를 낳는다 —
  // 조용하고 위험한 방향이라 여기서 시끄럽게 죽는다.
  // 로그가 **새 표기를 직접 알려주는 것**이 5분 수정과 수사(搜査)의 차이다.
  if (payload.covered.length === 0) {
    console.warn(
      "[holidays] 라벨 불일치 — 관측된 DESCRIPTION:",
      JSON.stringify(parsed.stats.labels),
    );
    throw new LabelMismatchError(
      `공휴일로 분류된 연도가 없다. 관측된 라벨: ${JSON.stringify(parsed.stats.labels)}`,
    );
  }

  return payload;
}


export async function GET() {
  await requireSession();

  if (cache && Date.now() - cache.fetchedAt < TTL_MS) {
    return NextResponse.json(cache.payload);
  }

  try {
    const payload = await fetchFeed();
    cache = { fetchedAt: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);

    // 만료된 캐시라도 있으면 그걸 준다 — 공휴일은 소급해 바뀌지 않으므로 낡은 목록이
    // "답 없음"보다 낫다. 캐시조차 없으면 정직하게 실패한다.
    if (cache) {
      console.warn("[holidays] 갱신 실패, 만료 캐시 사용:", message);
      return NextResponse.json({ ...cache.payload, stale: true });
    }

    console.warn("[holidays] upstream failed:", message);
    return NextResponse.json(
      {
        error: e instanceof LabelMismatchError ? "label_mismatch" : "upstream_failed",
        message,
      },
      { status: 502 },
    );
  }
}
