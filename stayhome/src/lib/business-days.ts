import { addDaysIso, parseDate } from "@/lib/utils";
import type { HolidayOracle } from "@/lib/holidays-kr";

/**
 * 마감일 역산 — **달력 기준 D-10 + 양 끝 휴일 보정**.
 *
 * ## 규칙 (운영자 확인, 2026-09-02)
 *
 * ```
 * 1. 기준일 보정  기준일이 주말/공휴일이면 하루씩 뒤로 가 첫 영업일을 찾는다 → startIso
 * 2. 카운트       startIso를 **1일째로 포함**해 n일을 센다 → rawIso = startIso - (n-1)일
 * 3. 결과 보정    rawIso가 주말/공휴일이면 하루씩 뒤로 가 첫 영업일을 찾는다 → 답
 * ```
 *
 * 1·3단계는 **완전히 같은 연산**이라 헬퍼 하나(`previousBusinessDay`)를 공유하고,
 * 2단계만 산술이다. 세 줄 중 둘이 같은 함수라는 것이 이 모듈의 전부다.
 *
 * 조심할 것 둘, 둘 다 운영자가 확인해 준 사항이다:
 *
 * - **`-(n-1)`이 오타가 아니다.** 기준일을 1일째로 세므로 10일째는 `-9`일이다.
 *   `-10`으로 바꾸면 아래 골든 케이스가 하루씩 밀린다(2026-10-16이 10/7이 아니라 10/6).
 * - **보정은 카운트 *이전*이다.** 순서를 뒤집으면 2026-10-05가 9/22가 되어 틀린다.
 *
 * ## 골든 케이스 (구현이 틀리면 여기서 갈린다)
 *
 * 기준일 `2026-10-05(월)`, n=10. 이 날은 개천절(10/3 토)의 대체공휴일이다.
 *
 * ```
 *  1  기준일 보정  10/05(월) 대체공휴일 → 10/04(일) 주말 → 10/03(토) 주말 → 10/02(금) 영업일
 *  2  카운트       10/02 - 9일 = 09/23(수)
 *  3  결과 보정    09/23(수) 영업일 → 그대로
 * ```
 *
 * 결과 `2026-09-23(수)`. 세 단계를 모두 지나가는 유일한 케이스라 여기 적어 둔다.
 * 짝이 되는 반대 모양은 `2026-10-19(월) → 2026-10-08(목)`이다 — 기준일 보정은 없고
 * 10일째 `10/10(토)`가 주말이라 뒤로 가다 한글날 `10/09(금)`까지 건너뛴다.
 *
 * ## 왜 boolean이 아니라 판별 유니온을 돌려주는가
 *
 * 실패를 값으로 표현해야 화면이 "계산 불가"를 **날짜 대신** 그릴 수 있다.
 * 그리고 성공 시 건너뛴 내역을 같이 주는 것은 장식이 아니다 — 화면의
 * "10일째 10.10(토) 휴일(한글날) → 10.8(목)"이 사용자가 답을 검산할 유일한 단서다.
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
      /** 1단계 결과 = 세기를 시작한 날. 기준일이 영업일이면 기준일과 같다. */
      startIso: string;
      /** 2단계 결과 = `startIso - (n-1)`일. 보정 전이라 휴일일 수 있다. */
      rawIso: string;
      /** 기준일 → `startIso`. 비어 있으면 기준일이 영업일이었다는 뜻. */
      baseSkipped: Skip;
      /** `rawIso` → `iso`. 비어 있으면 10일째가 그대로 영업일이었다는 뜻. */
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
 * 규칙의 1단계와 3단계가 이 함수 하나다. 날짜 산술은 전부 `addDaysIso`를 거치므로
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
 * `baseIso`의 마감일 — 위 헤더의 3단계.
 *
 * `leadDays >= 1`이 전제다(호출부가 상수를 넘긴다). `leadDays === 1`이면
 * `rawIso === startIso`이고, 그때도 3단계는 무동작이라 규칙이 무너지지 않는다.
 */
export function deadlineIso(
  baseIso: string,
  leadDays: number,
  oracle: HolidayOracle,
): DeadlineResult {
  const start = previousBusinessDay(baseIso, oracle);
  if (!start.ok) return start;

  // 기준일 포함이 곧 -(n-1)이다. 헤더의 경고를 볼 것.
  const rawIso = addDaysIso(start.iso, -(leadDays - 1));

  const end = previousBusinessDay(rawIso, oracle);
  if (!end.ok) return end;

  return {
    ok: true,
    iso: end.iso,
    startIso: start.iso,
    rawIso,
    baseSkipped: start.skip,
    resultSkipped: end.skip,
  };
}
