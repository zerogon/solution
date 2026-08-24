/**
 * 재고 행이 얼마나 낡았는가.
 *
 * `availability-tone.ts`와 짝이다. 그 파일이 "이 방을 예약할 수 있나"를 말한다면
 * 여기는 "그 대답을 마지막으로 확인한 게 언제인가"를 말한다. 두 축은 독립이고,
 * 섞으면 둘 다 못 읽게 된다 — 13일 전에 "예약 가능"이었다는 사실은 참이지만
 * 오늘 예약할 수 있다는 뜻이 아니다.
 *
 * 이 모듈이 생긴 이유: 2026-08-24 롯데 속초 8/24→8/25 조회에서 08-11에 수집된
 * `available=true` 행 3개가 방금 수집한 행과 **픽셀 단위로 같은** 초록 배지를 달고
 * 맨 위에 떠 있었다. 실제 사이트에는 그 방이 없었다.
 */

/**
 * 정상으로 볼 수 있는 최대 나이.
 *
 * **`scheduled-refresh`의 cron과 한 쌍이다** — 지금 정기 수집은 매일 09:00 KST
 * 1회이므로 건강한 행은 24시간을 넘지 않고, 2시간은 크롤이 늦어지는 몫이다.
 * 주기를 바꾸면 이 값도 바꿔야 한다. 어긋났을 때의 증상은 "멀쩡한 데이터가
 * 낡았다고 표시됨"(너무 짧게 잡은 경우) 또는 "하루 빠진 걸 아무도 모름"(너무 길게).
 */
export const FRESH_MAX_MS = 26 * 60 * 60 * 1000;

/**
 * 여기를 넘으면 화면에서 등급을 낮춘다(초록 "예약 가능"을 떼고 중립색으로).
 *
 * 3일은 "수집이 두 번 빠졌다"이고, 그쯤 되면 사이트 재고가 바뀌었다고 보는 편이
 * 안전하다. 이 임계 아래(`aging`)에서는 색을 유지하고 나이만 보여준다 —
 * 하루 늦은 것까지 회색으로 만들면 회색이 기본값이 되어 아무 신호도 못 준다.
 */
export const AGING_MAX_MS = 3 * 24 * 60 * 60 * 1000;

export type Freshness = "fresh" | "aging" | "stale";

export function freshnessOf(syncedAt: string | Date, now: number = Date.now()): Freshness {
  const age = now - new Date(syncedAt).getTime();
  if (!Number.isFinite(age)) return "stale"; // 못 읽는 시각은 믿지 않는다
  if (age < FRESH_MAX_MS) return "fresh";
  if (age < AGING_MAX_MS) return "aging";
  return "stale";
}

/**
 * "방금" / "13분" / "5시간" / "13일" — 단위만. 뒤에 붙는 말(갱신/확인)은 호출부가 정한다.
 *
 * `BranchResultSection`의 지역 함수였던 것을 옮겨 왔다. 이제 행 배지와 지점 헤더가
 * 같은 문자열을 쓰므로 "3분 전 갱신"과 "1시간 전 확인"이 같은 행에서 엇갈리지 않는다.
 */
export function relativeAge(syncedAt: string | Date, now: number = Date.now()): string {
  const min = Math.round((now - new Date(syncedAt).getTime()) / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.round(hr / 24)}일 전`;
}

/** 지점 헤더용 — "13일 전 갱신". */
export function syncedLabel(syncedAt: string | Date, now: number = Date.now()): string {
  const age = relativeAge(syncedAt, now);
  return age === "방금" ? "방금 갱신" : `${age} 갱신`;
}

/** 강등된 행의 배지용 — "13일 전 확인". 뜻이 다르므로 "예약 가능"이라고 쓰지 않는다. */
export function checkedLabel(syncedAt: string | Date, now: number = Date.now()): string {
  const age = relativeAge(syncedAt, now);
  return age === "방금" ? "방금 확인" : `${age} 확인`;
}
