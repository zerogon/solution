import { occupancyOf } from "../_shared/occupancy";
import type { InventoryRow } from "../types";
import { KENSINGTON, type KensingtonBranch } from "./config";

/** 조각 안 객실 하나: `a.btn_roomsel[data-room-type-cd]` + 그 안의 `.title span`. */
export interface RoomEntry {
  code: string;
  name: string;
}

/**
 * `quick_roomdata_member` HTML 조각 → 객실 목록.
 *
 * 정규식이지만 **세어서 검증한다**: 조각 안 `btn_roomsel` 개수와 뽑힌 개수가 다르면
 * 마크업이 바뀐 것이고, 그때 일부만 돌려주면 빠진 방이 `removeVanishedRows`에 의해
 * "매진"으로 지워진다. 그래서 어긋나면 던진다 — 그 지점은 0행(=건드리지 않음)이 된다.
 *
 * 예약 가능한 객실이 없으면 사이트는 "예약 가능한 객실 및 상품 조회 결과가 없습니다."를
 * 주고 `btn_roomsel`이 0개다. 그건 빈 배열이다.
 */
export function parseRoomFragment(html: string): RoomEntry[] {
  const anchors = html.match(/class="[^"]*\bbtn_roomsel\b[^"]*"/g)?.length ?? 0;
  const out: RoomEntry[] = [];
  const re =
    /data-room-type-cd="([^"]*)"[^>]*>\s*<div class="title">\s*<span>([\s\S]*?)<\/span>/g;
  for (const m of html.matchAll(re)) {
    const name = decodeEntities(m[2]).replace(/\s+/g, " ").trim();
    if (m[1] && name) out.push({ code: m[1], name });
  }
  if (out.length !== anchors) {
    throw new Error(`PARSE_MISMATCH: btn_roomsel ${anchors}개 중 ${out.length}개만 해석됨`);
  }
  return out;
}

/** 재고 행 + 그 방의 사이트 코드. 인원·요금은 코드로 묻는다(`occupancy.ts`·`price.ts`). */
export interface KensingtonRow {
  code: string;
  row: InventoryRow;
}

/**
 * 객실 목록 → 재고 행.
 *
 * **목록에 있는 방 = 예약 가능.** 사이트는 매진된 방을 표기하지 않고 목록에서 뺀다
 * (설악비치 11/1: 1박 9개 → 2박 8개). 빠진 방은 `run.ts`의 `removeVanishedRows`가 지운다.
 * `closingSoon`은 근거가 없어 항상 false.
 *
 * 목록의 가격(`data-kfx-price`)은 쓰지 않는다 — 1박 "~최저가"이고 `price`의 계약은 숙박
 * 총액이다. 총액은 `quick_set_summary`에 있고 `price.ts`가 최신화에서만 붙인다.
 * 같은 이름이 두 번 나오면 첫 것만 쓴다(upsert 키가 객실명이라 어차피 하나로 뭉개진다).
 */
export function buildRows(rooms: RoomEntry[], branch: KensingtonBranch): KensingtonRow[] {
  const seen = new Set<string>();
  const rows: KensingtonRow[] = [];
  for (const room of rooms) {
    if (seen.has(room.name)) continue;
    seen.add(room.name);
    rows.push({
      code: room.code,
      row: {
        branchName: branch.value,
        roomType: room.name,
        region: branch.region,
        available: true,
        closingSoon: false,
        detailUrl: KENSINGTON.bookingUrl,
      },
    });
  }
  return rows;
}

/**
 * `popup_room_info`(객실 정보 팝업) → 기준·최대 인원.
 *
 * 형식은 `<span class="desc_title">인원</span><span>기준 4명 (최대 성인6/어린이0)</span>`.
 * **최대 = 성인 최대 + 어린이 최대**다 — 설악비치에 `기준 3명 (최대 성인2/어린이3)`인 방이
 * 있어 성인만 쓰면 최대가 기준보다 작아진다(2026-10-18, 83개 유형 census).
 * 모르는 코드에는 사이트가 빈 틀(`기준 명 (최대 성인)`)을 주고, 그건 null이다.
 */
export function parseOccupancy(html: string): InventoryRow["occupancy"] | null {
  const cell = html.match(/desc_title">\s*인원\s*<\/span>\s*<span>([^<]*)</)?.[1];
  const m = cell?.trim().match(/^기준\s*(\d+)\s*명\s*\(최대\s*성인\s*(\d+)\s*\/\s*어린이\s*(\d+)\s*\)$/);
  if (!m) return null;
  return occupancyOf(m[1], Number(m[2]) + Number(m[3]));
}

/**
 * `quick_set_summary`(예약 요약) → 숙박 총액. 판정할 수 없으면 null.
 *
 * 요약은 `객실요금 합계`(`#total_amt`)와 그 아래 날짜별 요금(`2026. 11. 13(금)  ￦ 169,000`)을
 * 준다. 숫자 하나만 믿지 않고 **서로 맞을 때만** 쓴다 — 틀린 요금은 빈칸보다 나쁘다:
 * - 날짜별 줄이 요청한 밤과 정확히 같은 날짜들이고,
 * - 그 합이 `객실요금 합계`와 같고,
 * - `할인액`이 0이다(0이 아니면 합계가 할인 전인지 후인지 이 화면만으로는 모른다).
 */
export function parseSummaryTotal(html: string, nights: string[]): number | null {
  const total = amount(html.match(/id="total_amt">([^<]*)</)?.[1]);
  const discount = amount(html.match(/id="total_sale_amt">([^<]*)</)?.[1]);
  if (total == null || discount !== 0) return null;

  const lines = [
    ...html.matchAll(
      /<span class="tit">\s*(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\([^)]*\)\s*<\/span>\s*<span class="desc"[^>]*>[^<]*<span class="num">([^<]*)<\/span>/g,
    ),
  ];
  if (lines.length !== nights.length) return null;
  let sum = 0;
  for (const [i, m] of lines.entries()) {
    const date = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    const value = amount(m[4]);
    if (date !== nights[i] || value == null) return null;
    sum += value;
  }
  return sum === total && total > 0 ? total : null;
}

function amount(s: string | undefined): number | null {
  if (s == null) return null;
  const digits = s.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  return Number(digits);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}
