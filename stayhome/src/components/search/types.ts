/** `/api/inventory`가 돌려주는 한 행. 라우트의 `select`와 필드가 일치해야 한다. */
export interface InventoryRow {
  id: string;
  resortName: string;
  branchName: string;
  roomType: string;
  region: string;
  available: boolean;
  closingSoon: boolean;
  detailUrl: string | null;
  syncedAt: string;
}

/** 실제로 조회를 실행한 조건. 이 값이 React Query 키가 된다. */
export interface Committed {
  checkin: string;
  checkout: string;
  /** "" → 전체 지점. */
  branch: string;
}
