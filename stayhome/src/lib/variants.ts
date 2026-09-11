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
          typeof (x as InventoryVariant).remaining === "number"),
    )
  );
}
