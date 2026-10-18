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

/**
 * 객실 목록 → 재고 행.
 *
 * **목록에 있는 방 = 예약 가능.** 사이트는 매진된 방을 표기하지 않고 목록에서 뺀다
 * (설악비치 11/1: 1박 9개 → 2박 8개). 빠진 방은 `run.ts`의 `removeVanishedRows`가 지운다.
 * `closingSoon`은 근거가 없어 항상 false.
 *
 * 요금은 붙이지 않는다 — 목록의 가격은 1박 "~최저가"이고 `price`의 계약은 숙박 총액이다
 * (`docs/crawlers/kensington.md`의 "요금"). 같은 이름이 두 번 나오면 첫 것만 쓴다
 * (upsert 키가 객실명이라 어차피 하나로 뭉개진다).
 */
export function buildRows(rooms: RoomEntry[], branch: KensingtonBranch): InventoryRow[] {
  const seen = new Set<string>();
  const rows: InventoryRow[] = [];
  for (const room of rooms) {
    if (seen.has(room.name)) continue;
    seen.add(room.name);
    rows.push({
      branchName: branch.value,
      roomType: room.name,
      region: branch.region,
      available: true,
      closingSoon: false,
      detailUrl: KENSINGTON.bookingUrl,
    });
  }
  return rows;
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
