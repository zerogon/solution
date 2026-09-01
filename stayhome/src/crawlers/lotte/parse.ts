import { occupancyOf } from "../_shared/occupancy";
import type { InventoryRow } from "../types";
import { LOTTE, type LotteBranch } from "./config";

/**
 * Subset of the roomList API response we rely on.
 *
 * 한 객실 객체는 키를 **49개** 갖고 있다. 여기 선언된 것이 전부라고 읽지 말 것 —
 * 2026-08-24 조사(`debug-page.ts keys`)가 그것을 세어서 확인했고, 그때 요금이
 * 이미 이 응답 안에 있다는 것도 같이 드러났다.
 */
export interface RoomListPayload {
  rsltCd?: string;
  rsltMsg?: string;
  roomList?: Array<{
    roomNm?: string;
    /** remaining bookable rooms — "0" means sold out */
    roomCnt?: string | number;
    /** waitlist count for sold-out rooms */
    waitRsvCnt?: string | number;
    onlineUseYn?: string;
    roomFlgNm?: string;
    /**
     * **그 숙박 기간의 1박 평균가**(원). 총액이 아니다.
     *
     * 실측(속초, 같은 방): 1박 238,620 → 2박 234,255 → 3박 232,800으로 *줄었다*.
     * 평일이 섞이며 평균이 내려간 것이고, 2박 234,255×2 = 468,510 =
     * 238,620(주말) + 229,890(평일)로 같은 응답의 `minRateAmt`와 산술이 정확히 맞는다.
     * **회원 트랙도 같은 계약이다**(1·2·3박 모두 1박 평균) — 2026-09-01 실측.
     *
     * ⚠️ **이 값이 공시가인지 회원가인지는 이 응답을 봐서는 알 수 없다.**
     * `memberType`은 회원 트랙에서도 전 객실 `""`이고(2026-09-01 실측), 다른 어떤 칸도
     * 트랙을 신고하지 않는다. 갈리는 것은 **우리가 보낸 요청**뿐이므로 라벨의 근거도
     * 거기에 있어야 한다 — 아래 `parseRoomList`가 어느 페이로드에서 온 숫자인지로
     * `kind`를 정하는 이유이고, 응답에서 유도하려던 첫 설계가 성립하지 않은 이유다.
     */
    roomAvgAmt?: string | number;
    /**
     * 기준인원 / 최대인원(명). 문자열 숫자로 온다(`"4"`).
     *
     * 실측(2026-08-28, 비로그인 BAR 호출로 4개 지점 71객실 전수): 결측 0건,
     * `maxCapacity < capacity`인 행 0건, 그리고 **둘이 실제로 다르다** — 속초
     * "콘도 스위트 더블" 4/6, "콘도 럭셔리 A형" 6/8, 제주 "승효상 115평형 (4룸)"
     * 9/11. 하나만 저장하면 절반을 버리는 셈이다. 같은 응답의 `shortDesc`가
     * "…기준인원 6인의 콘도 타입 객실"이라고 같은 말을 해서 교차 검증도 된다.
     *
     * `roomAvgAmt`와 달리 **매진된 방에도 값이 온다**(속초 매진 8행 전부). 정원은
     * 가용성의 함수가 아니라 방의 속성이고, 그래서 아래 조립부에서 요금과 다르게
     * `available`을 보지 않는다.
     */
    capacity?: string | number;
    maxCapacity?: string | number;
  }>;
}

/**
 * Map a roomList API payload to normalized inventory rows.
 *
 * Availability semantics (observed 2026-07-26 against bizCd=81):
 * - `roomCnt` is the remaining-room count; sold-out rooms report "0" and the
 *   UI offers 대기예약 instead of booking.
 * - `onlineUseYn: "N"` rooms aren't bookable online regardless of count.
 */
export function parseRoomList(
  payload: RoomListPayload,
  /**
   * 같은 지점·같은 날짜를 회원 트랙(`memberNo`+`ownType`)으로 물은 응답. 없으면 `null`.
   *
   * **재고는 여기서 오지 않는다.** 회원 트랙은 BAR의 부분집합이라(실측: 부여 23/25 ·
   * 제주 13/14 · 김해 18/20) 이걸로 재고를 만들면 예약 가능한 방이 조회 화면에서
   * 사라진다. 여기서 오는 것은 요금뿐이다.
   */
  memberPayload: RoomListPayload | null,
  branch: LotteBranch,
  dates: { checkinDt: string; checkoutDt: string; nights: number },
): InventoryRow[] {
  // Empty roomList is a legitimate result: fully booked for the range
  // ("AVAILRSV" = 대기예약만 가능) or reservations not open ("NORSV").
  // The caller logs rsltCd/rsltMsg; here it just yields zero rows.
  const rooms = payload.roomList ?? [];

  const detailUrl =
    `${LOTTE.bookingUrl}?bizCd=${branch.bizCd}` +
    `&checkinDt=${dates.checkinDt}&checkoutDt=${dates.checkoutDt}` +
    `&roomCnt=1&reservationType=BAR`;

  // 회원 요금표: 객실명 → 그 숙박의 총액. 이름이 유일 키인 것은 BAR와 같은 근거다
  // (`roomNm`이 서로 다르다 — 아래 dedupe가 실제로 지우는 것이 없다).
  const memberRates = new Map<string, number>();
  for (const room of memberPayload?.roomList ?? []) {
    const name = room.roomNm?.trim();
    if (!name || memberRates.has(name)) continue;
    const amount = stayTotal(room.roomAvgAmt, dates.nights);
    if (amount != null) memberRates.set(name, amount);
  }

  const out: InventoryRow[] = [];
  const seen = new Set<string>();
  for (const room of rooms) {
    const roomType = room.roomNm?.trim();
    if (!roomType || seen.has(roomType)) continue;
    seen.add(roomType);

    const remaining = Number(room.roomCnt ?? 0);
    const available = Number.isFinite(remaining) && remaining > 0 && room.onlineUseYn !== "N";

    // 예약할 수 없는 방에는 붙이지 않는다. `roomList`는 매진된 방(대기예약)도 실어
    // 보내고 거기에도 `roomAvgAmt`가 있으므로, 가용성을 안 보면 실측 113행이
    // `available=false`인 채로 요금을 갖게 된다. 화면은 어차피 `showsPrice(tone)`가
    // 거르지만("예약할 수 없는 방의 가격은 정보가 아니라 잡음이다") **DB에 두면
    // 불변식이 깨진다** — 이 저장소의 검증 목록에 "available=false에 요금 없음"이
    // 있고, 리솜 수집기도 available한 행만 대상으로 삼는다.
    const price = available ? priceOf(room, roomType, memberPayload, memberRates, dates.nights) : null;
    const occupancy = occupancyOf(room.capacity, room.maxCapacity);

    out.push({
      branchName: branch.value,
      roomType,
      region: branch.region,
      available,
      closingSoon: available && remaining <= LOTTE.closingSoonThreshold,
      detailUrl,
      // `price`는 금액과 종류가 한 덩어리다 — 둘 다이거나 둘 다 아니다.
      ...(price == null ? {} : { price }),
      // 인원도 한 덩어리이지만 **`available`을 보지 않는다.** 위 요금과 이 비대칭이
      // 의도다 — 정원은 시간이 지나도, 방이 매진돼도 변하지 않는 방의 속성이라
      // 낡은 행에서도 여전히 맞는 값이다.
      ...(occupancy == null ? {} : { occupancy }),
    });
  }
  return out;
}

/**
 * 이 행의 요금과, 그 요금이 무엇인지.
 *
 * **라벨은 숫자가 어느 페이로드에서 왔는지로 정해진다.** 응답에는 트랙을 신고하는 칸이
 * 없으므로(`memberType`이 양쪽 다 `""`) 유일하게 남은 근거가 출처다. 세 갈래이고,
 * 실패 방향이 전부 안전한 쪽인 것이 이 함수의 요점이다:
 *
 * - **회원 트랙을 받았고 이 방이 거기 있다** → 회원가. 담당자가 안내할 숫자다.
 * - **회원 트랙을 받았는데 이 방이 거기 없다** → 요금 없음. 회원 트랙은 BAR의
 *   부분집합이고(부여 25→23), 빠진 방은 회원 요금이 없는 방이다. 여기서 BAR 값을
 *   대신 넣으면 한 지점 안에 회원가와 공시가가 라벨 없이 섞인다 — 행 단위로는
 *   구별할 방법이 없고, `price.ts`가 존재하는 이유가 정확히 그 혼동이다.
 *   **빈칸은 정보가 없는 것이지만 섞인 숫자는 틀린 안내가 된다.**
 * - **회원 트랙 자체가 없다**(로그인 전이거나 회원 콜이 실패했거나 분양회원이 아니거나)
 *   → BAR 공시가. 2026-09-01 이전의 동작 그대로이고, 라벨도 그때 그대로다.
 */
function priceOf(
  room: NonNullable<RoomListPayload["roomList"]>[number],
  roomType: string,
  memberPayload: RoomListPayload | null,
  memberRates: Map<string, number>,
  nights: number,
): { amount: number; kind: "member" | "public" } | null {
  if (memberPayload) {
    const amount = memberRates.get(roomType);
    return amount == null ? null : { amount, kind: "member" };
  }
  const amount = stayTotal(room.roomAvgAmt, nights);
  return amount == null ? null : { amount, kind: "public" };
}

/**
 * 1박 평균가 × 박수 → 그 숙박의 총액. 값이 미덥지 않으면 `null`.
 *
 * **곱하는 것이 이 함수의 전부이고, 그게 요점이다.** `roomAvgAmt`는 총액이 아니라
 * 평균이라, 그대로 `price`에 넣으면 `InventoryRow.price`의 계약("이 행이 서술하는
 * 숙박 **전체**의 요금")을 어기고 2박이 실제의 절반으로 발행된다 —
 * 2026-08-09에 고친 소노 2박 버그와 정확히 같은 모양이다.
 *
 * 평균 × 박수가 총액과 같다는 것은 평균의 정의이지 추정이 아니다. 다만 사이트가
 * 반올림한 평균을 주므로 마지막 자리가 실제와 몇 원 어긋날 수 있다 — 그건
 * 담당자의 안내를 틀리게 만들 크기가 아니고, 반대로 이 곱을 생략했을 때의 오차는
 * 100%다.
 *
 * 거르는 것들: 숫자가 아니거나(문자열 `""`·null), 유한하지 않거나, 0 이하.
 * 필드가 있다고 값이 있는 게 아니라는 것은 리솜 `rmAmt`에서 이미 배웠다
 * (506엔트리 전부 `"0"`이었다).
 */
function stayTotal(avg: string | number | undefined, nights: number): number | null {
  if (avg == null || avg === "") return null;
  const perNight = Number(avg);
  if (!Number.isFinite(perNight) || perNight <= 0) return null;
  if (!Number.isFinite(nights) || nights < 1) return null;
  return Math.round(perNight * nights);
}
