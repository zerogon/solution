import type { ResortSlug } from "@/generated/prisma/enums";
import type { InventoryRow } from "./types";

/**
 * 운영자가 손으로 넣은 1박 단가 하나. `/api/room-rates`가 돌려주는 shape과 같아야 한다.
 *
 * `ResortInventory.price`와 **단위가 다르다** — 저쪽은 숙박 총액이고 이쪽은 1박이다.
 * 총액은 여기서 만들어지는 파생값이라, 그 변환이 이 파일 밖으로 새면 안 된다.
 */
export interface ManualRate {
  resortSlug: ResortSlug;
  branchName: string;
  roomType: string;
  /** 1박 단가(원). */
  perNight: number;
  /** 운영자가 적은 근거. 평문이다 — 자격증명을 담지 않는다(스키마 주석). */
  note: string | null;
  /** ISO 문자열. 이 값이 수동 요금의 **나이**다 — 행의 `syncedAt`이 아니다. */
  updatedAt: string;
}

/**
 * 병합 키.
 *
 * **슬러그를 포함한다.** `groupByBranch`가 `branchName` 하나로 묶는다고 해서 지점명이
 * 리조트 사이에서 유일하다는 보장이 되는 것은 아니다 — 지금 57지점에서 충돌이 0건인 것은
 * 관측이지 제약이 아니고, 어긋나면 증상이 에러가 아니라 **다른 리조트의 요금이 붙는 것**이다.
 *
 * 구분자는 저장소 관용구를 따른다(`run.ts`의 dedupe 키). NUL 리터럴이 아니라 이스케이프로
 * 쓰는 이유도 같다 — 원시 NUL이 들어가면 파일이 `grep`에 걸리지 않는다.
 */
export function rateKey(r: {
  resortSlug: ResortSlug;
  branchName: string;
  roomType: string;
}): string {
  return `${r.resortSlug}\u0000${r.branchName}\u0000${r.roomType}`;
}

/** 요금 목록을 키로 찾을 수 있게 접는다. */
export function indexRates(rates: ManualRate[]): Map<string, ManualRate> {
  return new Map(rates.map((r) => [rateKey(r), r]));
}

/**
 * 자동 수집 요금이 **없는** 행에만 수동 단가를 얹는다.
 *
 * 우선순위가 이 함수의 조기 반환 한 줄(`row.price != null`)로 표현된다 — 사이트가 답한
 * 값이 있으면 그것을 쓰고, 사람이 적은 값은 빈칸만 채운다. 반대로 하면 사이트 요금이
 * 바뀌어도 화면이 옛 수동값을 계속 주장하게 된다.
 *
 * ⚠️ **빈칸은 소노·한화만의 일이 아니다.** 롯데는 회원 트랙이 BAR의 부분집합이라 거기 없는
 * 방이 빈칸이고(부여 23/25 · 제주 13/14 · 김해 18/20), 오크밸리는 밸리 31평·46평을 일부러
 * 안 붙이며, 리솜은 최신화를 안 누른 윈도우가 통째로 빈칸이다. 즉 **한 지점 섹션 안에
 * 자동 요금 행과 수동 요금 행이 실제로 섞인다** — 그래서 행마다 출처 표식이 필요하다
 * (`BranchResultSection`의 `수동` 라벨). 종류 라벨은 섹션 헤더에 한 번만 그려지므로
 * 그것만으로는 어느 행이 어느 쪽인지 말할 수 없다.
 *
 * ⚠️ **`nights`는 화면 상태가 아니라 실제로 조회된 조건에서 와야 한다**
 * (`SearchView`의 `committedNights`). 사용자가 박수를 바꾸고 아직 조회를 누르지 않았을 때
 * 그 둘이 갈리고, 그러면 요금이 **다른 숙박의 것**으로 계산된다.
 *
 * ⚠️ **`row.id`를 보존한다.** 지점 섹션의 tone Map과 `<li key>`가 전부 id 기반이다.
 *
 * 얹을 것이 없으면 **입력 배열을 그대로 돌려준다** — 새 배열을 만들면 호출부의 memo가
 * 매번 무효화되고, 그 memo에 필터 칩 카운트가 걸려 있다.
 */
export function withManualRates(
  rows: InventoryRow[],
  rates: Map<string, ManualRate>,
  nights: number,
): InventoryRow[] {
  if (rates.size === 0) return rows;

  let changed = false;
  const merged = rows.map((row) => {
    if (row.price != null) return row;
    const rate = rates.get(rateKey(row));
    if (!rate) return row;
    changed = true;
    return {
      ...row,
      price: { amount: rate.perNight * Math.max(1, nights), kind: "manual" as const },
    };
  });
  return changed ? merged : rows;
}

/**
 * 이 행의 요금을 그려도 되는가.
 *
 * `showsPrice(tone)`를 그대로 쓰지 않는 이유는 그 게이트가 **크롤이 쓴 요금**을 위한
 * 것이기 때문이다. 그 함수의 근거는 "요금은 행과 같은 문장으로 쓰이므로 행보다 낡을 수
 * 없지만, 행 자체는 낡을 수 있다"인데, 수동 단가는 그 문장 밖에서 쓰였다 — 행이 13일
 * 됐다는 사실이 이 숫자에 대해 아무 말도 하지 않는다.
 *
 * 그 면제의 대가는 **자기 나이를 자기가 말하는 것**으로 갚는다(행 `title`과 관리 화면의
 * `updatedAt`). 이 저장소에서 "요금의 나이 = `synced_at`" 등식 밖에 서는 최초의 요금이라,
 * 그 장치가 없으면 6개월 된 단가와 어제 넣은 단가가 픽셀 단위로 같아진다.
 *
 * ⚠️ 렌더와 섹션 헤더의 라벨 집합이 **반드시 같은 술어를 써야 한다.** 어긋나면 증상이
 * 에러가 아니라 "라벨 없는 숫자" 또는 "숫자 없는 라벨"이고, `price.ts`가 어휘 셋이
 * 어긋났을 때의 위험으로 지목한 것과 같은 모양이다.
 */
export function showsRowPrice(
  price: { kind: string } | null,
  autoVisible: boolean,
): boolean {
  if (price == null) return false;
  return price.kind === "manual" ? true : autoVisible;
}
