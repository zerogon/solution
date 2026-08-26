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
export type PriceKind = "member" | "public" | "memberTable";

/**
 * 어휘가 답하는 것은 두 가지이고, 둘 다 필요하다.
 *
 * **어느 요금 트랙인가** — 회원가냐 공시가냐. 위의 이유 그대로다.
 *
 * **어떻게 알았는가** — 사이트가 그 숙박에 대해 견적한 값이냐, 사이트가 공표한
 * 요금표를 우리가 조인해 계산한 값이냐. 두 번째가 `memberTable`이다.
 * 같은 "회원가"라도 신뢰 등급이 다르다: 견적은 그 방·그 날짜에 대한 사이트의 답이고,
 * 계산은 **표가 우리가 읽은 그대로일 때만** 맞는다. 표는 개정되고, 개정은 우리에게
 * 통보되지 않는다. 숫자만 보면 둘은 구별되지 않으므로 어휘가 구별해야 한다.
 *
 * 이 목록에 값을 더하는 것은 마이그레이션이 아니다 — `price_kind`는 Prisma enum이
 * 아니라 text다(`schema.prisma`의 그 필드 주석 참조). 대신 **여기가 유일한 출처**이므로
 * `isPriceKind`와 `PRICE_KIND_LABEL`을 같이 늘려야 한다. 셋이 어긋나면 증상은 에러가
 * 아니라 `/api/inventory`가 그 요금을 조용히 null로 떨어뜨리는 것이다.
 *
 * **이 라벨은 눈에 보이게 그린다.** 예전에는 `title` 속성에만 있었고 근거는 "리조트가
 * 하나뿐인 동안 배지는 소음이다"였다. 그 전제가 2026-08-26에 깨졌다 — 롯데 공시가가
 * 붙으면서 한 화면에 서로 다른 트랙의 숫자가 나란히 서게 됐다. 그리고 `title`은
 * **모바일에 존재하지 않는다**: 이 도구는 PWA이고 담당자는 폰에서 본다.
 */
export const PRICE_KIND_LABEL: Record<PriceKind, string> = {
  member: "회원가",
  public: "공시가",
  memberTable: "회원가·요금표",
};

export function isPriceKind(v: unknown): v is PriceKind {
  return v === "member" || v === "public" || v === "memberTable";
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
