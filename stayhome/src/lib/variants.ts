/**
 * 접힌 재고 행 하나를 사이트의 실제 예약 단위로 분해한 것.
 *
 * 크롤러(`src/crawlers/**`)와 조회 화면(`src/components/search/**`)이 둘 다 읽는다.
 * `price.ts`와 같은 자리에 두는 이유도 같다 — 의존이 크롤러 → lib 한쪽으로만 흐르면
 * 클라이언트가 크롤러 config(`storeCd` 같은 크롤 전용 코드)를 번들에 끌고 오는 사고가
 * 구조적으로 불가능하다.
 *
 * **이것은 행의 분해이지 새 판정이 아니다.** 소노의 `room/list/pc`는 뷰 변형(`rmTypeCd`)
 * 마다 상태와 잔여를 따로 주는데, `sono/parse.ts`는 그것을 `resortTypeNm + roomTypeNm`
 * 한 행으로 접는다(2026-08-31 실측 570그룹 중 300개가 접힘, 전부 뷰 축). 운영자가 보고
 * 싶은 것이 그 접힌 것들이라, 행은 그대로 두고 그 아래에 목록을 단다(2026-09-11 결정).
 * 그래서 행 수 · 유니크 키 · 필터 칩 건수 · 수동 요금 조인 키(`(지점, roomType)`)는 이
 * 필드와 **무관**하고, `removeVanishedRows`·백스톱·신선도 어느 것도 이 필드를 모른다.
 *
 * 어휘는 사이트의 5개 상태 코드가 아니라 **행의 (available, closingSoon)**이다. 분해이므로
 * 행과 같은 말을 써야 하고, 그래서 화면은 `TONE_*`를 그대로 재사용한다.
 */
import { isPriceKind, type PriceKind } from "./price";

export interface InventoryVariant {
  /**
   * 화면 라벨("파크뷰"). 크롤러가 완성한다 — DB 행이 스스로를 설명해야 하고, API와
   * 화면은 `viewCd` 같은 사이트 코드를 알 필요가 없다.
   * **모르는 코드에는 이름을 지어내지 않는다.** 이름표에 없는 코드는 코드 그대로 온다.
   */
  label: string;
  /** 사이트의 예약 단위 코드(소노 `rmTypeCd`). 라벨이 같은 변형을 구별하는 키. */
  code: string;
  /** 숙박의 **모든 밤**이 예약 가능이고 잔여 > 0. 행의 `available`과 같은 규칙을 변형 하나에 적용한 것. */
  available: boolean;
  /** `available`이고 한 밤이라도 마감임박. 행의 `closingSoon`과 같은 규칙. */
  closingSoon: boolean;
  /**
   * `available`일 때 숙박의 모든 밤 중 **가장 적은** 잔여 실수, 아니면 null.
   *
   * min인 이유: N박은 매 밤 방이 있어야 하므로 가장 빠듯한 밤이 실제로 예약할 수 있는
   * 수다. 체크인 밤만 보면 2026-08-09 이전 소노 2박 버그와 같은 모양이 된다.
   * null인 이유: 사이트는 예약대기(`W`) 행에 **음수**를 준다(관측 -31). 그건 수가
   * 아니고, 매진 변형의 0은 상태 칩이 이미 말하는 것이다.
   */
  remaining: number | null;

  /**
   * 이 변형으로 그 숙박을 예약했을 때의 요금 — **숙박 전체의 총액**(원).
   *
   * **요금이 행이 아니라 여기 붙는 이유**는 사이트가 그렇게 답하기 때문이다.
   * `room/detail/price`는 `rmTypeCd`(= 이 변형) 하나를 묻고, 한 행은 변형을 여럿
   * 접고 있으며(실측 570그룹 중 300개) 같은 행의 변형끼리 요금이 다르다. 행에 하나를
   * 고르면 그 순간 나머지는 틀린 값이고, 최저가로 접으면 행이 "부터"라고 말해야 하는데
   * 그 말은 행이 하는 다른 모든 말(잔여·상태)과 단위가 어긋난다.
   *
   * 금액과 종류는 `InventoryRow.price`와 **같은 계약**이다 — 둘 다이거나 둘 다 아니다.
   * 숫자만으로는 회원가와 공시가를 구별할 수 없기 때문이고(`price.ts`), 그래서 화면은
   * 이 종류도 섹션 헤더의 라벨 집합에 넣어 센다.
   *
   * ⚠️ **예약할 수 있는 변형에만 붙는다.** 사이트는 마감임박·예약대기 변형에도 금액을
   * 답하지만(실측 대기 392,000원), 예약할 수 없는 방의 가격은 정보가 아니라 잡음이다 —
   * 롯데 `parse.ts`가 `available`을 보고서야 요금을 붙이는 그 규칙과 같다.
   *
   * 없는 것이 기본이다. 요금은 "최신화"가 지목한 (지점, 숙박)에만 붙고, 그 밖에는
   * 이 칸이 비어 있다(`sono/prices.ts`).
   */
  price?: { amount: number; kind: PriceKind } | null;
}

/**
 * `/api/inventory`의 가드. `isPriceKind`와 같은 자리 — jsonb에서 온 값이 이 모양이
 * 아니면 크래시가 아니라 **"세부 목록 없음"**으로 강등한다.
 */
export function isVariantList(v: unknown): v is InventoryVariant[] {
  return (
    Array.isArray(v) &&
    v.every(
      (x) =>
        x !== null &&
        typeof x === "object" &&
        typeof (x as InventoryVariant).label === "string" &&
        typeof (x as InventoryVariant).code === "string" &&
        typeof (x as InventoryVariant).available === "boolean" &&
        typeof (x as InventoryVariant).closingSoon === "boolean" &&
        ((x as InventoryVariant).remaining === null ||
          typeof (x as InventoryVariant).remaining === "number") &&
        hasValidPrice(x as InventoryVariant),
    )
  );
}

/**
 * 요금은 **없어도 되고**(대부분의 행이 그렇다), 있으면 행의 요금과 같은 모양이어야 한다.
 *
 * 없는 것을 허용하는 이유가 둘이다 — 요금은 "최신화" 경로에서만 붙고, 2026-09-21 이전에
 * 쓰인 행들은 이 칸 자체가 없다. 그 행들이 세부 목록을 통째로 잃으면 안 된다.
 */
function hasValidPrice(x: InventoryVariant): boolean {
  if (x.price == null) return true;
  return (
    typeof x.price === "object" &&
    typeof x.price.amount === "number" &&
    Number.isFinite(x.price.amount) &&
    x.price.amount > 0 &&
    isPriceKind(x.price.kind)
  );
}
