import { addDaysIso, parseDate } from "@/lib/utils";
import type { HolidayOracle } from "@/lib/holidays-kr";

/**
 * 마감일 역산 — **달력 기준 D-10 + 결과만 휴일 보정**.
 *
 * ## 규칙 (운영자 확인, 2026-09-09)
 *
 * ```
 * 1. 카운트     기준일에서 n일을 뺀다 → rawIso = 기준일 - n일   (기준일의 휴일 여부 무관)
 * 2. 결과 보정  rawIso가 주말/공휴일이면 하루씩 뒤로 가 첫 영업일을 찾는다 → 답
 * ```
 *
 * 1단계는 산술이고 2단계만 오라클을 묻는다(`previousBusinessDay`). 이 모듈의 전부다.
 *
 * ## 이전 규칙과 갈리는 곳 둘 (2026-09-02 규칙 → 09-09 교체)
 *
 * - **기준일은 보정하지 않는다.** 옛 규칙은 기준일이 휴일이면 직전 영업일로 당긴 뒤
 *   셌다. 운영자 결정으로 그 단계가 사라졌다 — 선택한 날짜가 무슨 날이든 그 날에서 뺀다.
 *   판별 케이스: `2026-08-17(월, 쉬는 날 광복절) → 2026-08-07(금)`. 옛 규칙이면 8/5다.
 * - **기준일을 포함하지 않는다.** 옛 규칙은 기준일을 1일째로 세서 `-(n-1)`이었다.
 *   이제 `-n`이다. 판별 케이스: `2026-10-16(금) → 2026-10-06(화)`. 옛 규칙이면 10/7다.
 *
 * ## 골든 케이스 (구현이 틀리면 여기서 갈린다)
 *
 * 기준일 `2026-10-05(월)`, n=10. 이 날은 개천절(10/3 토)의 대체공휴일이지만 **무관하다**.
 *
 * ```
 *  1  카운트     10/05 - 10일 = 09/25(금)
 *  2  결과 보정  09/25(금) 추석 → 09/24(목) 추석 연휴 → 09/23(수) 영업일
 * ```
 *
 * 결과 `2026-09-23(수)`. 기준일이 공휴일이면서 결과 보정이 평일 공휴일 둘을 건너뛰는,
 * 두 특징을 한 번에 보여주는 케이스라 여기 적어 둔다.
 * 짝은 `2026-10-19(월) → 2026-10-08(목)` — 10/09(금)가 한글날이라 하루 앞당긴다.
 *
 * ## 왜 boolean이 아니라 판별 유니온을 돌려주는가
 *
 * 실패를 값으로 표현해야 화면이 "계산 불가"를 **날짜 대신** 그릴 수 있다.
 * 그리고 성공 시 건너뛴 내역을 같이 주는 것은 장식이 아니다 — 화면의
 * "10일 전 10.9(금) 휴일(한글날) → 10.8(목)"이 사용자가 답을 검산할 유일한 단서다.
 *
 * ## `covers()`를 묻는 이유는 규칙이 바뀌어도 그대로다
 *
 * 공휴일을 적게 세면 → 보정이 덜 일어나고 → 결과가 **뒤로 밀린다**
 * → 사용자는 실제보다 시간이 더 있다고 믿는다. 즉 조용히 틀리는 쪽이 손해를 끼치는
 * 쪽이라, 판정할 수 없는 날에 닿으면 답을 만들지 않는다(`holidays-kr.ts` 헤더).
 */

/** 한 번의 보정에서 건너뛴 내역. */
export type Skip = {
  /** 건너뛴 주말 일수. */
  weekend: number;
  /** 건너뛴 공휴일. 주말과 겹친 공휴일은 주말로만 센다(중복 계상 방지). */
  holidays: { iso: string; name: string }[];
};

export type DeadlineResult =
  | {
      ok: true;
      /** 최종 답. 구조적으로 반드시 영업일이다. */
      iso: string;
      /** 1단계 결과 = `기준일 - n`일. 보정 전이라 휴일일 수 있다. */
      rawIso: string;
      /** `rawIso` → `iso`. 비어 있으면 10일 전이 그대로 영업일이었다는 뜻. */
      resultSkipped: Skip;
    }
  /** 오라클이 판정할 수 없는 날에 닿았다. `at`이 그 날짜. */
  | { ok: false; reason: "uncovered"; at: string }
  /** 오라클이 고장나 영원히 영업일이 안 나온다. 절대 도달하면 안 되는 안전망. */
  | { ok: false; reason: "unbounded" };

/** 성공한 계산의 전체 경로. 화면이 자기 답을 설명할 때 이 shape을 그대로 받는다. */
export type DeadlineTrace = Extract<DeadlineResult, { ok: true }>;

/**
 * 한국 최장 연휴가 주말과 붙어도 6~7일이다. 상한은 넉넉하되 **유한해야** 한다 —
 * 모든 날을 휴일이라 답하는 오라클이 UI 스레드를 잡으면 안 된다.
 * (`freshness.ts`의 `!Number.isFinite` 가드와 같은 자리다.)
 */
const MAX_BACKOFF_STEPS = 30;

type BackOff =
  | { ok: true; iso: string; skip: Skip }
  | { ok: false; reason: "uncovered"; at: string }
  | { ok: false; reason: "unbounded" };

/**
 * `iso`가 영업일이면 그대로, 아니면 **직전 영업일**.
 *
 * 규칙의 2단계가 이 함수다. 날짜 산술은 전부 `addDaysIso`를 거치므로
 * 월·연·윤년 경계가 `setUTCDate`로 정규화되고 DST는 구조적으로 존재하지 않는다.
 * 로컬 타임 `Date`를 여기서 만들면 안 된다 — 이 저장소의 UTC 자정 규약(`utils.ts`).
 */
function previousBusinessDay(iso: string, oracle: HolidayOracle): BackOff {
  const skip: Skip = { weekend: 0, holidays: [] };
  let cur = iso;

  for (let step = 0; step <= MAX_BACKOFF_STEPS; step += 1) {
    const day = parseDate(cur).getUTCDay();
    if (day === 0 || day === 6) {
      // 토·일은 공휴일 데이터와 무관하게 주말이다. 여기서 covers()를 묻지 않는 것은
      // 최적화가 아니라 정확성이다 — 답이 데이터에 의존하지 않는 날에 데이터를
      // 요구하면 멀쩡히 계산되는 케이스가 "계산 불가"로 떨어진다.
      skip.weekend += 1;
      cur = addDaysIso(cur, -1);
      continue;
    }

    if (!oracle.covers(cur)) return { ok: false, reason: "uncovered", at: cur };

    if (oracle.isHoliday(cur)) {
      skip.holidays.push({ iso: cur, name: oracle.nameOf(cur) ?? "공휴일" });
      cur = addDaysIso(cur, -1);
      continue;
    }

    return { ok: true, iso: cur, skip };
  }

  return { ok: false, reason: "unbounded" };
}

/**
 * `baseIso`의 마감일 — 위 헤더의 2단계.
 *
 * `leadDays >= 1`이 전제다(호출부가 상수를 넘긴다). `leadDays === 1`이면
 * `rawIso`가 전날이고, 그때도 2단계는 그대로 동작해 규칙이 무너지지 않는다.
 */
export function deadlineIso(
  baseIso: string,
  leadDays: number,
  oracle: HolidayOracle,
): DeadlineResult {
  // 기준일은 보정하지 않고 포함하지도 않는다 — 헤더의 "갈리는 곳 둘"을 볼 것.
  const rawIso = addDaysIso(baseIso, -leadDays);

  const end = previousBusinessDay(rawIso, oracle);
  if (!end.ok) return end;

  return { ok: true, iso: end.iso, rawIso, resultSkipped: end.skip };
}
