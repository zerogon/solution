import type { MenuDto as Menu, PickDto as Pick } from "@/lib/events";

export interface MenuAggregate {
  menu: Menu;
  totalQty: number;
  /** 가격을 아는 메뉴만 금액이 있다. */
  subtotal: number | null;
  members: { name: string; qty: number }[];
}

export interface MemberAggregate {
  name: string;
  items: { menu: Menu; qty: number; subtotal: number | null }[];
  totalQty: number;
  subtotal: number;
  /** 가격 미정 메뉴가 섞여 있어 소계가 하한이라는 뜻. */
  hasUnpriced: boolean;
}

export interface CartSummary {
  byMenu: MenuAggregate[];
  byMember: MemberAggregate[];
  total: number;
  totalQty: number;
  hasUnpriced: boolean;
  memberCount: number;
}

/** 메뉴·장바구니 행에서 화면이 쓰는 집계를 한 번에 만든다. 순수 함수. */
export function summarizeCart(menus: Menu[], picks: Pick[]): CartSummary {
  const menuById = new Map(menus.map((m) => [m.id, m]));
  const byMenuMap = new Map<number, MenuAggregate>();
  const byMemberMap = new Map<string, MemberAggregate>();

  for (const p of picks) {
    const menu = menuById.get(p.menuId);
    if (!menu || p.quantity <= 0) continue;
    const line = menu.price != null ? menu.price * p.quantity : null;

    let agg = byMenuMap.get(menu.id);
    if (!agg) {
      agg = { menu, totalQty: 0, subtotal: menu.price != null ? 0 : null, members: [] };
      byMenuMap.set(menu.id, agg);
    }
    agg.totalQty += p.quantity;
    if (agg.subtotal != null && line != null) agg.subtotal += line;
    agg.members.push({ name: p.memberName, qty: p.quantity });

    let mem = byMemberMap.get(p.memberName);
    if (!mem) {
      mem = { name: p.memberName, items: [], totalQty: 0, subtotal: 0, hasUnpriced: false };
      byMemberMap.set(p.memberName, mem);
    }
    mem.items.push({ menu, qty: p.quantity, subtotal: line });
    mem.totalQty += p.quantity;
    if (line != null) mem.subtotal += line;
    else mem.hasUnpriced = true;
  }

  // 메뉴 순서는 메뉴 목록 순서(sortOrder)를 따른다.
  const byMenu = menus.filter((m) => byMenuMap.has(m.id)).map((m) => byMenuMap.get(m.id)!);
  const byMember = [...byMemberMap.values()].sort((a, b) => a.name.localeCompare(b.name, "ko"));

  let total = 0;
  let totalQty = 0;
  let hasUnpriced = false;
  for (const m of byMenu) {
    totalQty += m.totalQty;
    if (m.subtotal != null) total += m.subtotal;
    else hasUnpriced = true;
  }

  return { byMenu, byMember, total, totalQty, hasUnpriced, memberCount: byMember.length };
}

/** 특정 사람의 메뉴별 수량 맵. */
export function myQuantities(picks: Pick[], memberName: string | null): Map<number, number> {
  const map = new Map<number, number>();
  if (!memberName) return map;
  for (const p of picks) if (p.memberName === memberName && p.quantity > 0) map.set(p.menuId, p.quantity);
  return map;
}
