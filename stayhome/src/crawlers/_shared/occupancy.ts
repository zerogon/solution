/**
 * 재고 행에 붙일 정원(기준·최대)을 판정한다.
 *
 * 롯데 `lotte/parse.ts`에만 있던 것을 올렸다 — 2026-08-31 조사에서 리솜과 오크밸리도
 * 정원을 답한다는 것이 확인되면서 호출자가 셋이 됐다. 이 저장소가 `_shared/pool.ts`
 * (롯데·한화가 같은 병렬화를 필요로 했을 때)와 `_shared/branches.ts`(다섯 크롤러가
 * 같은 3줄 프롤로그를 갖고 있었을 때)에서 한 것과 같은 판단이다.
 *
 * **가드를 크롤러마다 따로 두면 안 되는 이유**는 증상이 에러가 아니기 때문이다 —
 * 어긋나면 "리조트마다 다른 기준으로 판정된 정원"이 조회 화면의 한 열에 나란히 선다.
 */

/**
 * 기준인원 / 최대인원 → `InventoryRow.occupancy`. 값이 미덥지 않으면 `null`.
 *
 * **둘 다이거나 둘 다 아니다.** 기준만 받아서 "4인"이라 쓰면, 최대 6인인 방을
 * 6인 가족을 위해 찾던 담당자가 후보에서 뺀다 — 없는 정보보다 나쁜, 틀린 정보다.
 * (그래서 한화는 정원을 공개하고도 붙이지 않는다: `객실정원`은 있는데 최대가 없다.
 *  상세는 `AGENTS.md`의 한화 "### 인원" 절.)
 *
 * 거르는 것들:
 * - 숫자가 아니거나(문자열 `""`·null), 유한하지 않거나, 정수가 아니거나, 1 미만.
 *   **필드가 있다고 값이 있는 게 아니다.** 이 조사에서만 세 번 나왔다 — 리솜
 *   `allCondos`의 `initPersCount`/`maxPersCount`가 17엔트리 전부 `0`이고(정작 값은
 *   이름이 다른 `calendarRooms`의 `initPersCnt`/`maxPersCnt`에 있다), 소노 공개
 *   객실 페이지의 `personCnt`/`peopleCntText`가 61객실 전부 `null`이며, 그 전에
 *   리솜 `rmAmt`가 506엔트리 전부 `"0"`이었다.
 * - `max < standard`. 뒤집힌 값은 에러가 아니라 조용히 틀린 안내가 된다 — 사이트가
 *   두 필드의 의미를 바꾸면 그 형태로 나타난다.
 */
export function occupancyOf(
  standardValue: string | number | null | undefined,
  maxValue: string | number | null | undefined,
): { standard: number; max: number } | null {
  const standard = personCount(standardValue);
  const max = personCount(maxValue);
  if (standard == null || max == null) return null;
  if (max < standard) return null;
  return { standard, max };
}

export function personCount(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}
