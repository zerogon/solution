import type { ResortSlug } from "@/generated/prisma/enums";
import type { PriceKind } from "@/lib/price";

/** `/api/inventory`가 돌려주는 한 행. 라우트의 `select`와 필드가 일치해야 한다. */
export interface InventoryRow {
  id: string;
  /** 행이 자기 리조트를 스스로 설명한다 — 표시명(`resortName`)으로 슬러그를 역추론하지 않기 위해서. */
  resortSlug: ResortSlug;
  resortName: string;
  branchName: string;
  roomType: string;
  region: string;
  available: boolean;
  closingSoon: boolean;
  detailUrl: string | null;
  /**
   * 이 행이 서술하는 숙박 **전체**의 요금. 1박당이 아니다 — 화면이 나눠서 "1박 평균"을
   * 병기한다.
   *
   * **빈칸은 에러가 아니다.** 리조트마다 요금을 얻는 비용이 달라서 채워지는 빈도도
   * 다르다 — 롯데는 재고 응답 안에 같이 오므로 정기 수집에서도 붙고, 리솜은 행 하나에
   * 콜 하나라 사용자가 "최신화"로 지목한 (지점, 날짜)에만 붙는다. 아예 없는 곳도 있다.
   *
   * DB는 컬럼 두 개(`price`/`price_kind`)지만 라우트가 하나로 접어 내려보낸다 —
   * 금액과 그 종류는 둘 다이거나 둘 다 아니어야 하고, 두 필드로 두면 라벨 없는
   * 숫자를 그릴 수 있게 된다.
   */
  price: { amount: number; kind: PriceKind } | null;
  syncedAt: string;
}

/**
 * 실제로 조회를 실행한 조건. 이 값이 React Query 키가 된다.
 *
 * 지역·지점은 여기 없다 — 서버에 보내는 축은 `resort` 하나뿐이고 나머지는
 * 클라이언트에서 `matchesPlace`로 좁힌다. 덕분에 칩을 눌러도 왕복이 없고,
 * `stale` 흐림이 날짜/리조트 변경에만 걸린다.
 */
export interface Committed {
  checkin: string;
  checkout: string;
  /** null → 전체 리조트. */
  resort: ResortSlug | null;
}

/**
 * 조회 화면이 아는 지점 하나. 크롤러 config에서 UI에 필요한 필드만 뽑은 것이라
 * `bizCd` 같은 크롤 전용 필드는 들어오지 않는다 (`@/lib/resort-catalog`).
 */
export interface ResortProperty {
  /** `ResortInventory.branchName`과 문자 단위로 같은 값. 필터의 실제 키. */
  branchName: string;
  /** 칩에 쓰는 짧은 이름 ("속초"). */
  label: string;
  region: string;
}

/** 카탈로그 ∩ `Resort.active` 한 항목. */
export interface ResortCatalogEntry {
  slug: ResortSlug;
  /** 표시명은 DB의 `Resort.name` — 관리 화면과 일치시킨다. */
  name: string;
  properties: ResortProperty[];
}
