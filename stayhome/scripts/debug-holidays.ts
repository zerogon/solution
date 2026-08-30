import "dotenv/config";
import {
  subtractBusinessDaysIso,
  type BusinessDayResult,
} from "@/lib/business-days";
import { holidayOracle, type HolidayMap } from "@/lib/holidays-kr";
import { parseIcsHolidays } from "@/lib/holidays-ical";
import { addDaysIso, formatKoMd, parseDate } from "@/lib/utils";

/**
 * 마감일 계산기(영업일 기준 D-10)의 검증 도구.
 *
 * 이 저장소에는 테스트 러너가 없고(`package.json`에 `test` 스크립트가 없다) 관례가
 * `scripts/debug-*.ts`를 `tsx`로 돌리는 것이다.
 *
 *   npx tsx scripts/debug-holidays.ts golden            # 걷기 + 파서, 네트워크 없이
 *   npx tsx scripts/debug-holidays.ts feed [2026]       # 라이브 피드 요약 + 정규화 결과
 *   npx tsx scripts/debug-holidays.ts diff              # 라이브 ↔ 픽스처 (차이 있으면 exit 1)
 *   npx tsx scripts/debug-holidays.ts calc 2026-08-29   # 걸음을 한 줄씩 출력
 *
 * `calc`가 걸음 표를 찍는 이유: 답이 틀렸을 때 "틀렸다"가 아니라 **어디서 갈렸는지**가
 * 보여야 한다. `business-days.ts` 헤더의 표와 같은 모양이다.
 *
 * ## 이 파일의 판단 하나가 2026-08-30에 뒤집혔다
 *
 * 특일정보를 쓰던 시절 이 스크립트는 라우트의 파싱을 **일부러 재사용하지 않았다** —
 * 질문이 "라우트가 맞게 파싱하나"였기 때문이다. 소스가 Google iCal로 바뀌면서 가장
 * 위험한 코드가 걷기가 아니라 **파싱**이 됐고, 그렇다면 검증은 프로덕션과 **같은
 * 함수**(`parseIcsHolidays`)를 돌려야 한다. 그래서 지금은 반대로 공유한다.
 *
 * **전부 키 없이 돈다.** `golden`은 네트워크도 안 쓴다.
 */

const KO_DAY = ["일", "월", "화", "수", "목", "금", "토"] as const;

const FEED_URL =
  "https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics";

/** 라이브 피드를 받아 **프로덕션과 같은 파서**로 판다. */
async function loadFeed() {
  const res = await fetch(FEED_URL, {
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: "text/calendar" },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text.slice(0, 300)}`);
  return { text, parsed: parseIcsHolidays(text) };
}

/** 라이브 피드로 오라클을 만든다. 커버리지는 파서가 신고한 그대로 쓴다. */
async function oracleFor() {
  const { parsed } = await loadFeed();
  return { oracle: holidayOracle(parsed.covered, parsed.byYear), parsed };
}

/** 걸음을 한 줄씩 재현한다. `subtractBusinessDaysIso`와 같은 규칙을 손으로 편다. */
function walkTable(
  iso: string,
  n: number,
  o: { covers(s: string): boolean; isHoliday(s: string): boolean; nameOf(s: string): string | null },
) {
  let cur = iso;
  let counted = 0;
  const rows: string[] = [];
  for (let step = 1; step <= n * 3 + 40 && counted < n; step += 1) {
    cur = addDaysIso(cur, -1);
    const dow = KO_DAY[parseDate(cur).getUTCDay()];
    let verdict: string;
    if (dow === "일" || dow === "토") verdict = "주말 skip";
    else if (!o.covers(cur)) verdict = "판정 불가 → 중단";
    else if (o.isHoliday(cur)) verdict = `공휴일 skip (${o.nameOf(cur)})`;
    else {
      counted += 1;
      verdict = "영업일";
    }
    rows.push(
      `  ${String(step).padStart(2)}  ${cur}(${dow})  ${verdict.padEnd(24)} 누적 ${counted}`,
    );
    if (verdict.startsWith("판정 불가")) break;
  }
  console.log(rows.join("\n"));
}

function describe(r: BusinessDayResult): string {
  if (!r.ok) {
    return r.reason === "uncovered"
      ? `계산 불가 — ${r.at}를 판정할 수 없음`
      : "계산 불가 — 상한 초과(오라클 이상)";
  }
  const hol = r.skippedHolidays.map((h) => `${formatKoMd(h.iso)} ${h.name}`).join(", ");
  return `${r.iso} ${formatKoMd(r.iso)} · 주말 ${r.skippedWeekend}일 · 공휴일 ${r.skippedHolidays.length}일${hol ? ` (${hol})` : ""}`;
}

/**
 * 네트워크 없는 고정 케이스.
 *
 * 공휴일 목록은 2026년 실제 값을 인라인으로 박아 둔다 — 이 스텝의 질문은
 * "API가 맞나"가 아니라 **"주어진 공휴일 목록에서 걷기가 맞나"**이고, 그 둘을
 * 섞으면 API가 흔들릴 때 계산 회귀를 못 잡는다.
 */
/**
 * 파서가 라이브 피드에서 뽑아낸 스냅샷(2026-08-30 기준). `diff`가 이것과 대조한다.
 *
 * **2025는 얼어붙은 과거다** — 여기서 diff가 비지 않으면 세상이 바뀐 게 아니라
 * 파서가 깨진 것이다. 어떤 2026 단언보다 강한 회귀 신호라 한 해를 통째로 담았다.
 *
 * 이름이 피드 표기 그대로인 것도 의도다(`쉬는 날 광복절`, `크리스마스`). 정규화하면
 * diff가 영구히 시끄러워지고, 그러면 아무도 안 보게 된다.
 */
const GOLDEN_2025: HolidayMap = {
  "2025-01-01": "새해첫날",
  "2025-01-27": "설날 연휴",
  "2025-01-28": "설날 연휴",
  "2025-01-29": "설날",
  "2025-01-30": "설날 연휴",
  "2025-03-01": "삼일절",
  "2025-03-03": "쉬는 날 삼일절",
  "2025-05-05": "어린이날",
  "2025-05-06": "쉬는 날 어린이날",
  "2025-06-03": "대통령 선거",
  "2025-06-06": "현충일",
  "2025-08-15": "광복절",
  "2025-10-03": "개천절",
  "2025-10-05": "추석 연휴",
  "2025-10-06": "추석",
  "2025-10-07": "추석 연휴",
  "2025-10-08": "쉬는 날 추석 연휴",
  "2025-10-09": "한글날",
  "2025-12-25": "크리스마스",
};
const GOLDEN_2026: HolidayMap = {
  "2026-01-01": "새해첫날",
  "2026-02-16": "설날 연휴",
  "2026-02-17": "설날",
  "2026-02-18": "설날 연휴",
  "2026-03-01": "삼일절",
  "2026-03-02": "쉬는 날 삼일절",
  "2026-05-01": "노동절",
  "2026-05-05": "어린이날",
  "2026-05-24": "부처님오신날",
  "2026-05-25": "쉬는 날 부처님오신날",
  "2026-06-03": "지방선거일",
  "2026-06-06": "현충일",
  "2026-07-17": "제헌절",
  "2026-08-15": "광복절",
  "2026-08-17": "쉬는 날 광복절",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-26": "추석 연휴",
  "2026-10-03": "개천절",
  "2026-10-05": "쉬는 날 개천절",
  "2026-10-09": "한글날",
  "2026-12-25": "크리스마스",
};

/**
 * 파서 검증용 인라인 ICS.
 *
 * 실측 피드에서 실제로 부딪히는 모양만 넣었다 — 접힌 줄, `\,`/`\n` 이스케이프,
 * 걸러져야 할 기념일, 배타적 `DTEND`로 여러 날을 덮는 이벤트, 날짜가 아닌 `DTSTART`,
 * 그리고 **바닥에 미달해 판정 불가가 돼야 하는 해**.
 */
const FIXTURE_ICS = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  // 1) 평범한 공휴일 — SUMMARY에 이스케이프가 둘 섞여 있다.
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20260815",
  "DTEND;VALUE=DATE:20260816",
  "SUMMARY:광복절\\, 그리고\\; 뒤",
  "DESCRIPTION:공휴일",
  "END:VEVENT",
  // 2) 접힌 DESCRIPTION — 펴기 전에 분류하면 라벨이 안 맞는다.
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20260817",
  "SUMMARY:쉬는 날 광복절",
  "DESCRIPTION:공휴",
  " 일",
  "END:VEVENT",
  // 3) 기념일 — 제외돼야 한다.
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20260515",
  "SUMMARY:스승의날",
  "DESCRIPTION:기념일\\n숨기려면 설정으로",
  "END:VEVENT",
  // 4) 배타적 DTEND로 3일 — 전개돼야 한다(24·25·26, 27은 아님).
  "BEGIN:VEVENT",
  "DTSTART;VALUE=DATE:20260924",
  "DTEND;VALUE=DATE:20260927",
  "SUMMARY:추석 연휴",
  "DESCRIPTION:공휴일",
  "END:VEVENT",
  // 5) 시각이 붙은 DTSTART — 건너뛰어야 한다.
  "BEGIN:VEVENT",
  "DTSTART;TZID=Asia/Seoul:20260101T090000",
  "SUMMARY:시각 있는 이벤트",
  "DESCRIPTION:공휴일",
  "END:VEVENT",
  // 6) 나머지는 2026을 바닥 위로 올리기 위한 채움.
  ...Array.from({ length: 8 }, (_, i) => [
    "BEGIN:VEVENT",
    `DTSTART;VALUE=DATE:2026030${i + 1}`,
    `SUMMARY:채움${i + 1}`,
    "DESCRIPTION:공휴일",
    "END:VEVENT",
  ]).flat(),
  // 7) 공휴일 3건뿐인 해 — **판정 불가여야 한다.** 이 파일에서 가장 중요한 단언이다.
  ...["20990101", "20990102", "20990103"].map((d) => [
    "BEGIN:VEVENT",
    `DTSTART;VALUE=DATE:${d}`,
    "SUMMARY:희박한 해",
    "DESCRIPTION:공휴일",
    "END:VEVENT",
  ]).flat(),
  "END:VCALENDAR",
].join("\r\n");

/** 파서 단언. `golden`의 후반부이고, 위험이 걷기에서 파싱으로 옮겨간 만큼 무게가 크다. */
function goldenParser(): number {
  let failed = 0;
  const eq = (label: string, actual: unknown, expected: unknown) => {
    const a = JSON.stringify(actual), e = JSON.stringify(expected);
    const ok = a === e;
    if (!ok) failed += 1;
    console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : `\n      기대 ${e}\n      실제 ${a}`}`);
  };

  const r = parseIcsHolidays(FIXTURE_ICS);
  const y26 = r.byYear["2026"] ?? {};

  eq("이스케이프 해제 (\\, 와 \\;)", y26["2026-08-15"], "광복절, 그리고; 뒤");
  eq("접힌 DESCRIPTION도 공휴일로 분류", y26["2026-08-17"], "쉬는 날 광복절");
  eq("기념일은 제외", y26["2026-05-15"], undefined);
  eq("배타적 DTEND 전개 (24·25·26)", [y26["2026-09-24"], y26["2026-09-25"], y26["2026-09-26"]],
     ["추석 연휴", "추석 연휴", "추석 연휴"]);
  eq("DTEND 다음 날은 포함하지 않는다", y26["2026-09-27"], undefined);
  eq("VALUE=DATE가 아닌 DTSTART는 건너뜀", r.stats.skipped, 1);
  eq("2026은 바닥 통과", r.covered.includes(2026), true);
  eq("공휴일 3건뿐인 2099는 판정 불가", r.covered.includes(2099), false);
  eq("그래도 byYear에는 남아 있다(진실은 covered 쪽)", Object.keys(r.byYear["2099"] ?? {}).length, 3);
  eq("라벨 분포가 관측된다", Object.keys(r.stats.labels).sort(), ["공휴일", "기념일"]);

  return failed;
}

function golden(): number {
  const o = holidayOracle([2025, 2026], { "2025": GOLDEN_2025, "2026": GOLDEN_2026 });
  let failed = 0;

  const check = (label: string, actual: string, expected: string) => {
    const ok = actual === expected;
    if (!ok) failed += 1;
    console.log(`  ${ok ? "✓" : "✗"} ${label}\n      기대 ${expected}\n      실제 ${actual}`);
  };

  console.log("\n[golden] 기준 케이스 (business-days.ts 헤더의 표)");
  walkTable("2026-08-29", 10, o);
  const g = subtractBusinessDaysIso("2026-08-29", 10, o);
  check(
    "2026-08-29 → 10영업일 전",
    g.ok ? `${g.iso} 주말${g.skippedWeekend} 공휴일${g.skippedHolidays.length}` : describe(g),
    "2026-08-14 주말4 공휴일1",
  );

  console.log("\n[golden] 그 밖의 케이스");
  const cases: [string, string][] = [
    // 기준일이 공휴일(광복절, 토) — 특례 없이 그냥 뒤로 걷는다.
    // 8/14(금)부터 세어 8/3(월)이 10번째. 주말 2일만 끼고 공휴일은 안 만난다.
    ["2026-08-15", "2026-08-03"],
    // 월 경계 + 삼일절 대체공휴일(3/2) + 설날 3일(2/16~18)을 전부 통과한다.
    // 15일이 아니라 20일을 걸어야 10영업일이 나오는 케이스.
    ["2026-03-05", "2026-02-13"],
    // 윤년 2월.
    ["2028-03-05", ""],
  ];
  for (const [from, expected] of cases) {
    const r = subtractBusinessDaysIso(from, 10, o);
    if (!expected) {
      // 커버리지 밖은 "계산 불가"가 정답이다 — 조용히 틀린 날짜를 내면 안 된다.
      const isUncovered = !r.ok && r.reason === "uncovered";
      if (!isUncovered) failed += 1;
      console.log(`  ${isUncovered ? "✓" : "✗"} ${from} → 커버리지 밖이므로 계산 불가\n      실제 ${describe(r)}`);
      continue;
    }
    check(`${from} → 10영업일 전`, r.ok ? r.iso : describe(r), expected);
  }

  // 연도 경계: 2026-01-05에서 뒤로 걸으면 2025년으로 넘어간다.
  const cross = subtractBusinessDaysIso("2026-01-05", 10, o);
  check(
    "2026-01-05 → 전년으로 넘어감 (신정·성탄절 skip)",
    cross.ok ? cross.iso : describe(cross),
    "2025-12-18",
  );

  // 고장난 오라클이 멈추는가 — UI 스레드를 잡으면 안 된다.
  const broken = subtractBusinessDaysIso("2026-08-29", 10, {
    covers: () => true,
    isHoliday: () => true,
    nameOf: () => "전부휴일",
  });
  const bounded = !broken.ok && broken.reason === "unbounded";
  if (!bounded) failed += 1;
  console.log(`  ${bounded ? "✓" : "✗"} 모든 날이 휴일인 오라클 → unbounded로 종료`);

  console.log("\n[golden] 파서 (holidays-ical.ts)");
  failed += goldenParser();

  console.log(failed === 0 ? "\n[golden] 전부 통과" : `\n[golden] 실패 ${failed}건`);
  return failed;
}

async function main() {
  const [step, arg] = process.argv.slice(2);

  switch (step) {
    case "feed": {
      const { text, parsed } = await loadFeed();
      const { events, labels, skipped, perYear } = parsed.stats;
      console.log(`\n[feed] ${text.length.toLocaleString()}바이트 · VEVENT ${events}건 · 날짜를 못 읽어 건너뜀 ${skipped}건`);
      // 관측된 라벨 분포 — 구글이 **세 번째 카테고리**를 만들면 여기서만 보인다.
      // 개수 바닥은 그 경우를 못 잡으므로 이 줄이 유일한 감시선이다.
      console.log("[feed] DESCRIPTION 분포:", JSON.stringify(labels));
      console.log("[feed] 연도별 (공휴일/기타, covered?):");
      for (const y of Object.keys(perYear).sort()) {
        const c = perYear[y];
        console.log(`   ${y}  ${String(c.holidays).padStart(3)}/${String(c.other).padStart(3)}  ${parsed.covered.includes(Number(y)) ? "covered" : "—"}`);
      }
      if (arg) {
        console.log(`\n[feed] ${arg} 정규화 결과:`);
        for (const [iso, name] of Object.entries(parsed.byYear[arg] ?? {}).sort())
          console.log(`   ${iso}(${KO_DAY[parseDate(iso).getUTCDay()]})  ${name}`);
      }
      break;
    }
    case "diff": {
      // 라이브 ↔ 인라인 픽스처. 이번 조사에서 드러난 픽스처 오류 2건(제헌절 누락 ·
      // 9/28 과잉)을 잡았을 검사이고, 앞으로 새 임시공휴일·표기 변경이 여기서 먼저 보인다.
      const { parsed } = await loadFeed();
      const fixtures: Record<string, HolidayMap> = { "2025": GOLDEN_2025, "2026": GOLDEN_2026 };
      let diffs = 0;
      for (const y of Object.keys(fixtures).sort()) {
        const live = parsed.byYear[y] ?? {};
        const fix = fixtures[y];
        for (const iso of [...new Set([...Object.keys(live), ...Object.keys(fix)])].sort()) {
          if (!(iso in fix)) { console.log(`  + ${iso} ${live[iso]}  (피드에만)`); diffs++; }
          else if (!(iso in live)) { console.log(`  - ${iso} ${fix[iso]}  (픽스처에만)`); diffs++; }
          else if (live[iso] !== fix[iso]) { console.log(`  ~ ${iso} "${fix[iso]}" → "${live[iso]}"`); diffs++; }
        }
      }
      const known = new Set(["공휴일", "기념일"]);
      for (const label of Object.keys(parsed.stats.labels)) {
        if (!known.has(label)) { console.log(`  ! 모르는 DESCRIPTION 라벨: "${label}" (${parsed.stats.labels[label]}건)`); diffs++; }
      }
      console.log(diffs === 0 ? "\n[diff] 차이 없음" : `\n[diff] 차이 ${diffs}건`);
      process.exitCode = diffs === 0 ? 0 : 1;
      break;
    }
    case "calc": {
      const iso = arg;
      if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        throw new Error('날짜가 필요하다: npx tsx scripts/debug-holidays.ts calc 2026-08-29');
      }
      const { oracle, parsed } = await oracleFor();
      console.log(`\n[calc] 기준일 ${iso} ${formatKoMd(iso)} · 커버 연도 ${parsed.covered.join(", ")}`);
      walkTable(iso, 10, oracle);
      console.log(`\n  결과: ${describe(subtractBusinessDaysIso(iso, 10, oracle))}`);
      console.log(`  참고 — 단순 -10일: ${addDaysIso(iso, -10)} ${formatKoMd(addDaysIso(iso, -10))}`);
      break;
    }
    case "golden":
      process.exitCode = golden() === 0 ? 0 : 1;
      break;
    default:
      console.log("steps: golden | feed [year] | diff | calc <YYYY-MM-DD>");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
