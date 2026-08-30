import { addDaysIso, parseDate } from "@/lib/utils";
import type { HolidayOracle } from "@/lib/holidays-kr";

/**
 * 영업일 기준 날짜 역산.
 *
 * ## 규칙
 *
 * > 기준일에서 **하루씩 뒤로** 간다. 이동한 날이 영업일(월~금 **그리고** 공휴일이
 * > 아님)일 때만 카운트한다. 카운트가 `n`이 되면 그날이 답이다.
 *
 * 따라오는 결론 셋, 각각이 결정이다:
 *
 * - **기준일 자신은 절대 세지 않는다.** 먼저 이동하고 나서 판정하므로, 월요일에서
 *   시작해 월요일이 나오는 일은 없다.
 * - **답은 언제나 영업일이다.** 루프가 카운트된 날에서만 종료되므로 구조적으로 보장된다.
 * - **기준일은 아무 날이나 될 수 있다.** 토요일·공휴일 입력에 특례가 없다 —
 *   첫 이동이 곧 금요일로 내려간다. 행사일이 일요일인 것은 정상 상황이다.
 *
 * ## 골든 케이스 (구현이 틀리면 여기서 갈린다)
 *
 * 기준일 2026-08-29(토), n=10. 이 구간에 광복절 8/15(토)와 대체공휴일 8/17(월)이 있다.
 *
 * ```
 *  이동  날짜          판정              누적
 *  1~5   8/28 … 8/24   영업일             5
 *  6~7   8/23, 8/22    주말 skip          5
 *  8~11  8/21 … 8/18   영업일             9
 *  12    8/17(월)      대체공휴일 skip     9
 *  13~14 8/16, 8/15    주말 skip          9
 *  15    8/14(금)      영업일            10 → 종료
 * ```
 *
 * 결과 `2026-08-14(금)`. 단순 -10일은 `2026-08-19(수)`이고, 그 차이(5일)가
 * 이 모듈이 존재하는 이유다.
 *
 * ## 왜 boolean이 아니라 판별 유니온을 돌려주는가
 *
 * 실패를 값으로 표현해야 화면이 "계산 불가"를 **날짜 대신** 그릴 수 있다. 그리고
 * 성공 시 건너뛴 내역을 같이 주는 것은 장식이 아니다 — 화면의
 * "주말 4일 · 공휴일 1일(대체공휴일 8.17)"이 사용자가 답을 검산할 유일한 단서다.
 */
export type BusinessDayResult =
  | {
      ok: true;
      iso: string;
      /** 건너뛴 주말 일수. */
      skippedWeekend: number;
      /** 건너뛴 공휴일. 주말과 겹친 공휴일은 주말로만 센다(중복 계상 방지). */
      skippedHolidays: { iso: string; name: string }[];
    }
  /** 오라클이 판정할 수 없는 날에 닿았다. `at`이 그 날짜. */
  | { ok: false; reason: "uncovered"; at: string }
  /** 오라클이 고장나 영원히 영업일이 안 나온다. 절대 도달하면 안 되는 안전망. */
  | { ok: false; reason: "unbounded" };

/**
 * `iso`에서 `n` 영업일 뒤로 간 날짜.
 *
 * `n >= 1`이 전제다(호출부가 상수를 넘긴다). 날짜 산술은 전부 `addDaysIso`를 거치므로
 * 월·연·윤년 경계가 `setUTCDate`로 정규화되고 DST는 구조적으로 존재하지 않는다.
 * 로컬 타임 `Date`를 여기서 만들면 안 된다 — 이 저장소의 UTC 자정 규약(`utils.ts`).
 */
export function subtractBusinessDaysIso(
  iso: string,
  n: number,
  oracle: HolidayOracle,
): BusinessDayResult {
  // 10영업일이 최악의 연휴를 만나도 20일을 크게 넘지 않는다. 상한은 넉넉하되
  // 유한해야 한다 — 모든 날을 휴일이라 답하는 오라클이 UI 스레드를 잡으면 안 된다.
  // (`freshness.ts`의 `!Number.isFinite` 가드와 같은 자리다.)
  const maxSteps = n * 3 + 40;

  let cur = iso;
  let counted = 0;
  let skippedWeekend = 0;
  const skippedHolidays: { iso: string; name: string }[] = [];

  for (let step = 0; step < maxSteps; step += 1) {
    cur = addDaysIso(cur, -1);

    const day = parseDate(cur).getUTCDay();
    if (day === 0 || day === 6) {
      // 토·일은 공휴일 데이터와 무관하게 주말이다. 여기서 covers()를 묻지 않는 것은
      // 최적화가 아니라 정확성이다 — 답이 데이터에 의존하지 않는 날에 데이터를
      // 요구하면 멀쩡히 계산되는 케이스가 "계산 불가"로 떨어진다.
      skippedWeekend += 1;
      continue;
    }

    if (!oracle.covers(cur)) return { ok: false, reason: "uncovered", at: cur };

    if (oracle.isHoliday(cur)) {
      skippedHolidays.push({ iso: cur, name: oracle.nameOf(cur) ?? "공휴일" });
      continue;
    }

    counted += 1;
    if (counted === n) {
      return { ok: true, iso: cur, skippedWeekend, skippedHolidays };
    }
  }

  return { ok: false, reason: "unbounded" };
}
