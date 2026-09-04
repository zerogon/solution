import { addDaysIso } from "@/lib/utils";
import type { HolidayMap } from "@/lib/holidays-kr";

/**
 * Google 공개 캘린더(iCalendar)에서 한국 공휴일을 뽑는다.
 *
 * ## 왜 라우트 안이 아니라 여기 있나
 *
 * 이 기능의 위험은 원래 "걷기"(`business-days.ts`)에 있었고, 그래서
 * `scripts/debug-holidays.ts`는 라우트의 파싱을 **일부러 재사용하지 않았다** —
 * "라우트가 맞게 파싱하나"에 답해야 했기 때문이다. 소스를 Google로 바꾸면서
 * **그 판단이 뒤집혔다.** 이제 가장 위험한 코드가 파싱 자체이고, 그렇다면 스크립트는
 * 프로덕션과 **동일한 함수**를 오프라인으로 돌려야 한다. 라우트 모듈은 `next/server`와
 * `requireSession`의 인증 그래프를 끌고 와 `tsx`에서 부를 수 없다.
 *
 * ## 우리가 쓰는 RFC 5545는 이만큼뿐이다
 *
 * 줄 접힘(§3.1) · `VEVENT` 블록 · `NAME;PARAM=V:VALUE` 콘텐츠 줄(§3.1) ·
 * `VALUE=DATE`인 `DTSTART`/`DTEND`와 **배타적 `DTEND`**(§3.6.1) · TEXT 이스케이프(§3.3.11).
 * 이 다섯 가지 때문에 라이브러리를 넣지 않는다 — `ical.js`류는 우리가 쓰지 않는 표면이
 * 훨씬 넓고, 이 저장소에는 그걸 정직하게 유지해 줄 테스트 러너가 없다.
 *
 * ## 판정 불가를 표현하는 것이 이 파일의 본론이다
 *
 * `DESCRIPTION: 공휴일`은 **버전 없는 표시 문자열**이다. 구글이 표기를 바꾸면 필터가
 * 아무것도 매치하지 않고, 그러면 "공휴일이 없는 해"처럼 보인다. 그 결과는 휴일 보정이
 * 주말에서만 일어난 **며칠 늦은 날짜**이고, 늦은 마감일은 사용자가 시간이 더 있다고 믿게
 * 만드는 방향이다(`holidays-kr.ts` 헤더). 연휴가 낀 구간에서는 그 어긋남이 가장 크다 —
 * 하필 사람이 가장 많이 예약하는 날들이다. 옛 소스(특일정보)에는 `resultCode === "00"`
 * 이라는 기계 성공 신호가 있었지만 여기서 성공은 **추론**이다. 그래서
 * `MIN_HOLIDAYS_PER_YEAR` 바닥이 그 추론 자리에 서 있다.
 */

/**
 * 공휴일로 칠 `DESCRIPTION`. 한국어 피드 기준이다.
 *
 * 영문 피드(`en.south_korea#holiday@...`)를 쓰려면 이 값을 `"Public holiday"`로 바꾸고
 * 라우트의 `FEED_URL`에서 `ko.`를 `en.`으로 고치면 된다 — 비상시 2줄 수정.
 * 다만 `SUMMARY`가 화면에 그대로 나가므로(예: `쉬는 날 광복절`) 영문 피드는 한국어 UI에
 * `Liberation Day`를 찍는다. 이름 번역표를 새로 만들어야 하고, 그 표는 피드와 독립적으로
 * 썩는데 썩는 것이 보이지 않는다. 그래서 기본은 한국어 피드다.
 */
export const HOLIDAY_LABEL = "공휴일";

/**
 * 이만큼도 안 되는 해는 "휴일 없음"이 아니라 **판정 불가**다.
 *
 * 한국 법정공휴일은 15일 밑으로 내려간 적이 없고 이 피드의 실측은 연 16~23이다.
 * 10은 양쪽으로 2배 여유라 (a) 정상 연도를 거부할 수 없고 (b) 우연한 부분 매치로
 * 충족될 수도 없다. 표기 변경뿐 아니라 **부분적으로만 채워진 경계 연도**도 같이
 * 잡히므로, 라벨 감시가 아니라 개수 바닥으로 둔다.
 *
 * ⚠️ 이 바닥이 못 잡는 것이 하나 있다 — 구글이 **세 번째 카테고리**를 만들어 며칠만
 * 그쪽으로 옮기면, 나머지 20여 일이 그대로라 바닥에 안 걸리고 그 며칠만 조용히 빠진다.
 * 개수만으로는 "원래 20일인 해"와 "22일 중 2일이 딴 데로 간 해"를 구별할 수 없다.
 * 그 위험의 감시선은 `stats.labels`와 `debug-holidays.ts diff`이고 **둘 다 수동이다.**
 */
export const MIN_HOLIDAYS_PER_YEAR = 10;

/** 하나의 VEVENT가 만들 수 있는 최대 일수. 망가진 `DTEND`가 10년을 휴일로 칠하지 않게. */
const MAX_EVENT_DAYS = 31;

export interface ParsedFeed {
  /** 연도(문자열) → { "YYYY-MM-DD": 이름 }. 바닥 미달 연도도 들어 있다. */
  byYear: Record<string, HolidayMap>;
  /** 바닥을 통과한 연도. **커버리지의 진실은 이쪽이지 `byYear`의 키가 아니다.** */
  covered: number[];
  stats: {
    events: number;
    /** 관측된 모든 `DESCRIPTION` 첫 줄 → 개수. 세 번째 카테고리가 보이는 유일한 창. */
    labels: Record<string, number>;
    perYear: Record<string, { holidays: number; other: number }>;
    /** 날짜를 못 읽어 건너뛴 이벤트 수. */
    skipped: number;
  };
}

/**
 * RFC 5545 §3.1 줄 펴기.
 *
 * **분류보다 먼저 해야 한다.** 접힘은 옥텟 기준이라 멀티바이트 한글 한가운데서도
 * 일어나고, 접힌 줄을 그대로 비교하면 라벨이 조용히 안 맞는다. 실측 피드에는 접힌 줄이
 * 0건이지만 `기념일` 설명이 75옥텟을 넘어 언제든 접힐 수 있다.
 */
function unfold(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r\n|\r|\n/)) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/**
 * 콘텐츠 줄을 `NAME`, 파라미터, `VALUE`로 가른다.
 *
 * 첫 `:`를 **따옴표 밖에서** 찾는다 — 인용된 파라미터 값은 `:`를 담을 수 있다(§3.1).
 * 지금 피드에는 없지만 네 줄이면 그 부류의 놀람을 통째로 없앤다.
 */
function splitContentLine(line: string): { name: string; params: string; value: string } | null {
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ":" && !quoted) {
      const left = line.slice(0, i);
      const semi = left.indexOf(";");
      return {
        name: (semi === -1 ? left : left.slice(0, semi)).toUpperCase(),
        params: (semi === -1 ? "" : left.slice(semi + 1)).toUpperCase(),
        value: line.slice(i + 1),
      };
    }
  }
  return null;
}

/**
 * RFC 5545 §3.3.11 TEXT 이스케이프 해제 — **한 번의 정규식으로.**
 *
 * 순차 `.replace()`는 틀린다: `\\`를 먼저 풀면 `\\n`(백슬래시 + 문자 n)이 개행이 된다.
 * 치환 함수 하나짜리 정규식은 그 실수를 할 수 없다.
 */
function unescapeText(v: string): string {
  return v.replace(/\\([\\;,nN])/g, (_, c: string) =>
    c === "n" || c === "N" ? "\n" : c,
  );
}

/** `20260817` → `2026-08-17`. `new Date()`를 거치지 않는다(이 저장소의 UTC 자정 규약). */
function toIso(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/** `VALUE=DATE`이고 8자리일 때만 날짜로 인정한다. */
function dateValue(params: string, value: string): string | null {
  if (!params.split(";").includes("VALUE=DATE")) return null;
  const v = value.trim();
  return /^\d{8}$/.test(v) ? v : null;
}

export function parseIcsHolidays(text: string): ParsedFeed {
  const lines = unfold(text);

  const byYear: Record<string, HolidayMap> = {};
  const labels: Record<string, number> = {};
  const perYear: Record<string, { holidays: number; other: number }> = {};
  let events = 0;
  let skipped = 0;

  let inEvent = false;
  let start: string | null = null;
  let end: string | null = null;
  let summary = "";
  let description = "";

  const bump = (year: string, key: "holidays" | "other") => {
    perYear[year] ??= { holidays: 0, other: 0 };
    perYear[year][key] += 1;
  };

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      // 전역 정규식이 아니라 상태 기계인 이유: VALARM 같은 블록이 중첩된다.
      inEvent = true;
      start = end = null;
      summary = description = "";
      continue;
    }
    if (!inEvent) continue;

    if (line === "END:VEVENT") {
      inEvent = false;
      events += 1;

      if (!start) {
        // 시각이 붙은 DTSTART(`VALUE=DATE-TIME`)는 존(zone) 있는 Date를 만들어야 하는데
        // 이 저장소 날짜 규약이 그걸 금지한다. 국경일이 그렇게 올 일은 없고, 온다면
        // 추측하지 않고 버리는 것이 정직하다.
        skipped += 1;
        continue;
      }

      const label = unescapeText(description).split("\n")[0].trim();
      labels[label] = (labels[label] ?? 0) + 1;

      // ⚠️ **거르고 나서 넣는다.** 같은 날짜에 공휴일과 기념일이 함께 있는 날이 실측 7건
      // 있고 순서가 일정하지 않다(2022-05-08 부처님오신날+어버이날,
      // 2024-05-15 스승의날+부처님오신날). 넣고 나서 거르면 순서에 따라 공휴일이
      // 기념일에 덮인다.
      //
      // `includes`가 아니라 **완전 일치**다. 느슨한 규칙은 표기가 바뀌었을 때 절반만
      // 맞아 "부분적으로 틀린 집합"을 만드는데, 그게 가능한 결과 중 가장 나쁘다.
      const isHoliday = label === HOLIDAY_LABEL;
      const name = unescapeText(summary).trim() || HOLIDAY_LABEL;

      // DTEND는 **배타적**이다. 지금 피드는 하루짜리 이벤트만 내지만 그건 계약이 아니다.
      let days = 1;
      if (end) {
        const span = Math.round(
          (Date.parse(`${toIso(end)}T00:00:00.000Z`) -
            Date.parse(`${toIso(start)}T00:00:00.000Z`)) /
            86_400_000,
        );
        if (span > MAX_EVENT_DAYS) {
          skipped += 1;
          continue;
        }
        if (span > 1) days = span;
      }

      let iso = toIso(start);
      for (let i = 0; i < days; i += 1) {
        const year = iso.slice(0, 4);
        bump(year, isHoliday ? "holidays" : "other");
        if (isHoliday) {
          byYear[year] ??= {};
          byYear[year][iso] = name;
        }
        iso = addDaysIso(iso, 1);
      }
      continue;
    }

    const parsed = splitContentLine(line);
    if (!parsed) continue;
    if (parsed.name === "DTSTART") start = dateValue(parsed.params, parsed.value);
    else if (parsed.name === "DTEND") end = dateValue(parsed.params, parsed.value);
    else if (parsed.name === "SUMMARY") summary = parsed.value;
    else if (parsed.name === "DESCRIPTION") description = parsed.value;
  }

  const covered = Object.entries(perYear)
    .filter(([, c]) => c.holidays >= MIN_HOLIDAYS_PER_YEAR)
    .map(([y]) => Number(y))
    .sort((a, b) => a - b);

  return { byYear, covered, stats: { events, labels, perYear, skipped } };
}
