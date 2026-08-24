/**
 * 요금의 어휘와 표기.
 *
 * 크롤러(`src/crawlers/**`)와 조회 화면(`src/components/search/**`)이 둘 다 읽는다.
 * 크롤러 쪽에 두지 않은 이유는 방향 때문이다 — 클라이언트가 `@/crawlers/*`를 import
 * 하면 그 순간 크롤러 config(`condoCd` 같은 크롤 전용 코드)가 번들에 딸려간다.
 * 의존을 크롤러 → lib 한쪽으로만 흐르게 하면 그 사고가 구조적으로 불가능하다.
 */

/**
 * `ResortInventory.price`가 무엇인지.
 *
 * 숫자만 보고는 회원가와 공시가를 구별할 수 없다. 구별하지 못한 채 두 리조트를 나란히
 * 놓으면 사용자는 "이쪽이 4배 싸다"로 읽는데, 실제로는 서로 다른 요금 트랙을 비교한
 * 것일 수 있다 — 조사(2026-08-24)에서 롯데 응답의 금액이 `rsvType=BAR` 공시가임을
 * 이미 측정했다.
 *
 * **리조트 슬러그에서 유도하지 않는다.** 리솜 하나만 봐도 같은 응답이 회원 객실
 * 요금(`O12`)과 회원카드 대여 요금(`O20`)을 동시에 주고, 어느 쪽을 받을지는
 * 우리가 보내는 `rentYn`이 정한다. 슬러그 → 종류 맵은 리조트가 하나일 때도 이미 틀린다.
 */
export type PriceKind = "member" | "public";

/** 화면에 쓰는 이름. 지금은 `title`에만 쓴다 — 리조트가 하나뿐인 동안 배지는 소음이다. */
export const PRICE_KIND_LABEL: Record<PriceKind, string> = {
  member: "회원가",
  public: "공시가",
};

export function isPriceKind(v: unknown): v is PriceKind {
  return v === "member" || v === "public";
}

/** `252000` → `"252,000원"`. */
export function formatKrw(amount: number): string {
  return `${amount.toLocaleString("ko-KR")}원`;
}

/**
 * 숙박 총액을 밤 수로 나눈 값.
 *
 * 호출부는 이 값을 반드시 **"1박 평균"**이라고 불러야 한다. 요금은 밤마다 다르고
 * (주중·주말), 평균은 그 숙박의 어느 밤 값도 아니다. "1박 요금"이라고 쓰면 화면이
 * 관측하지 않은 것을 주장하게 된다.
 */
export function perNightAverage(total: number, nights: number): number {
  return Math.round(total / Math.max(1, nights));
}
