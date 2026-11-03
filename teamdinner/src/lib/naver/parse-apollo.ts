/**
 * m.place.naver.com HTML 안의 `window.__APOLLO_STATE__ = {...};` 를 꺼내 메뉴로 바꾼다.
 *
 * 2026-11-03 실측 구조 (restaurant/1435982635/menu/list):
 *   PlaceDetailBase:<id>        → name, category, roadAddress, address
 *   PlaceMenuItem:<itemId>      → id, name, description, thumbnailUrl, price.displayText, images[]
 *   PlaceMenuCategory:<catId>   → name, itemIds[]
 *   ROOT_QUERY["placeDetail({...})"].placeMenus.categories[].__ref → 카테고리 순서
 */
import { parsePriceText } from "@/lib/price";

export interface ParsedPlace {
  name: string;
  category: string | null;
  address: string | null;
}

export interface ParsedMenu {
  naverItemId: string;
  name: string;
  description: string | null;
  priceText: string | null;
  price: number | null;
  imageUrl: string | null;
  categoryName: string | null;
  sortOrder: number;
}

export interface ParsedMenuPage {
  place: ParsedPlace | null;
  menus: ParsedMenu[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * `window.__APOLLO_STATE__ =` 뒤의 `{`부터 짝이 맞는 `}`까지를 잘라낸다.
 * 정규식 `.*?\};`는 문자열 값 안의 `};`에서 끊길 수 있어 문자열을 인식하며 센다.
 */
export function extractApolloState(html: string): Obj | null {
  const marker = "window.__APOLLO_STATE__";
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf("{", at);
  if (start < 0) return null;

  let depth = 0;
  let inStr = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as Obj;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function toMenu(item: Obj, categoryName: string | null, sortOrder: number): ParsedMenu | null {
  const id = str(item.id);
  const name = str(item.name);
  if (!id || !name) return null;
  const priceObj = isObj(item.price) ? item.price : null;
  const priceText =
    str(priceObj?.displayText) ?? (typeof item.price === "string" ? str(item.price) : null);
  const firstImage = Array.isArray(item.images) && isObj(item.images[0]) ? str(item.images[0].url) : null;
  return {
    naverItemId: id,
    name,
    description: str(item.description),
    priceText,
    price: parsePriceText(priceText),
    imageUrl: str(item.thumbnailUrl) ?? firstImage,
    categoryName,
    sortOrder,
  };
}

const MENU_TYPENAMES = new Set(["PlaceMenuItem", "Menu"]);

export function parseMenuPage(state: Obj, placeId: string): ParsedMenuPage {
  // 1) 장소 기본 정보
  const base = state[`PlaceDetailBase:${placeId}`] ?? state[`RestaurantBase:${placeId}`];
  const place: ParsedPlace | null =
    isObj(base) && str(base.name)
      ? {
          name: str(base.name)!,
          category: str(base.category),
          address: str(base.roadAddress) ?? str(base.address),
        }
      : null;

  // 2) 카테고리 순서를 따라 메뉴 수집 (ROOT_QUERY → placeDetail → placeMenus → categories)
  const menus: ParsedMenu[] = [];
  const seen = new Set<string>();
  const root = isObj(state.ROOT_QUERY) ? state.ROOT_QUERY : null;
  const detailKey = root ? Object.keys(root).find((k) => k.startsWith("placeDetail(")) : undefined;
  const detail = detailKey && isObj(root![detailKey]) ? (root![detailKey] as Obj) : null;
  const placeMenus = detail && isObj(detail.placeMenus) ? detail.placeMenus : null;
  const categories = placeMenus && Array.isArray(placeMenus.categories) ? placeMenus.categories : [];

  for (const catRef of categories) {
    const cat = isObj(catRef) && typeof catRef.__ref === "string" ? state[catRef.__ref] : catRef;
    if (!isObj(cat)) continue;
    const categoryName = str(cat.name);
    const itemIds = Array.isArray(cat.itemIds) ? cat.itemIds : [];
    for (const itemId of itemIds) {
      if (typeof itemId !== "string") continue;
      const item = state[`PlaceMenuItem:${itemId}`] ?? state[`Menu:${itemId}`];
      if (!isObj(item) || seen.has(itemId)) continue;
      const m = toMenu(item, categoryName, menus.length);
      if (m) {
        menus.push(m);
        seen.add(itemId);
      }
    }
  }

  // 3) 참조 구조가 없거나 비어 있으면 state 전체에서 메뉴 타입을 긁는다 (등장 순서 유지)
  if (menus.length === 0) {
    for (const v of Object.values(state)) {
      if (!isObj(v) || !MENU_TYPENAMES.has(String(v.__typename))) continue;
      const m = toMenu(v, null, menus.length);
      if (m && !seen.has(m.naverItemId)) {
        menus.push(m);
        seen.add(m.naverItemId);
      }
    }
  }

  return { place, menus };
}
