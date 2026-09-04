/**
 * 한국 공휴일 판정자.
 *
 * `business-days.ts`와 짝이다. 그 파일이 "마감일이 언제인가"(달력 D-10 + 양 끝
 * 휴일 보정)를 계산한다면 여기는 "이 날이 쉬는 날인가"에 답한다.
 *
 * ## 왜 `(iso) => boolean`이 아닌가
 *
 * 평범한 술어는 **"모른다"를 표현할 수 없다.** 그러면 호출자는 *공휴일이 아니다*와
 * *데이터가 없다*를 같은 `false`로 받게 되고, 이 기능에서 그 혼동은 방향이 나쁘다:
 *
 *   공휴일을 적게 센다 → 보정이 덜 일어난다 → 결과가 **뒤로 밀린다**
 *   → 사용자는 실제보다 시간이 더 있다고 믿는다 → 마감을 놓친다.
 *
 * 즉 조용히 틀리는 쪽이 사용자에게 손해를 끼치는 쪽이다. `freshness.ts`가
 * "못 읽는 시각은 믿지 않는다"로 같은 자리를 지키는 것과 같은 판단이라,
 * 여기서는 `covers()`를 따로 두어 **모르면 계산 자체를 포기**하게 만든다.
 *
 * ## 소스를 갈아끼우는 경로
 *
 * 지금 구현은 `/api/holidays`(Google 공개 캘린더 iCal 피드)가 내려준 연도별 맵을
 * 감싼다. 다른 소스로 바꾸고 싶으면 이 파일에서 `HolidayOracle`을 만드는 함수 하나만
 * 새로 쓰면 되고 **`business-days.ts`는 한 줄도 바뀌지 않는다** — 그것이 이
 * 인터페이스가 존재하는 이유 전부다.
 *
 * **이건 주장이 아니라 관측이다.** 2026-08-30에 소스를 공공데이터포털 특일정보에서
 * Google 피드로 통째로 갈아끼웠고, 그때 `business-days.ts`의 diff가 실제로 비어 있었다.
 */

/** 연도별 `{ "YYYY-MM-DD": "공휴일 이름" }`. `/api/holidays`의 응답 형태이기도 하다. */
export type HolidayMap = Record<string, string>;

export interface HolidayOracle {
  /**
   * 이 날짜를 판정할 수 있는가.
   *
   * false면 호출자는 답을 만들지 말아야 한다. "공휴일이 아니다"로 읽으면 안 된다 —
   * 위 헤더의 실패 방향 논증이 그것을 막기 위해 있다.
   */
  covers(iso: string): boolean;
  /** 공휴일인가. `covers(iso)`가 true일 때만 의미가 있다. */
  isHoliday(iso: string): boolean;
  /** 표시용 이름("대체공휴일"). 공휴일이 아니거나 판정 불가면 null. */
  nameOf(iso: string): string | null;
}

/**
 * 서버가 답해준 연도들로 오라클을 만든다.
 *
 * `years`가 **커버리지의 단일 출처**다. `byYear`의 키를 대신 쓰면 안 된다 —
 * 어떤 해에 공휴일이 하나도 없다는 응답(있을 수 없지만, 파싱이 조용히 실패하면
 * 그렇게 보인다)과 그 해를 아예 안 받은 것이 구별되지 않는다.
 */
export function holidayOracle(
  years: readonly number[],
  byYear: Readonly<Record<string, HolidayMap>>,
): HolidayOracle {
  const covered = new Set(years);
  // 연도 경계를 넘나들며 조회하므로 하나로 합쳐 둔다. 키가 완전한 ISO 날짜라
  // 연도끼리 충돌할 수 없다.
  const flat: HolidayMap = {};
  for (const y of years) {
    Object.assign(flat, byYear[String(y)] ?? {});
  }

  return {
    covers: (iso) => covered.has(Number(iso.slice(0, 4))),
    isHoliday: (iso) => iso in flat,
    nameOf: (iso) => flat[iso] ?? null,
  };
}
