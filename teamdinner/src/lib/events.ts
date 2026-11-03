import { asc, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import type { Event, Menu, Pick } from "@/db/schema";
import { fetchPlaceMenus, resolvePlaceId, type ParsedMenu } from "@/lib/naver";
import { newSlug } from "@/lib/slug";

const { events, menus, picks } = schema;

/**
 * 클라이언트로 나가는 행은 Date가 ISO 문자열이다 — 서버 컴포넌트 props와 fetch JSON이
 * 같은 모양이어야 react-query `initialData`와 폴링 결과가 섞여도 타입이 하나다.
 */
export type Serialized<T> = {
  [K in keyof T]: T[K] extends Date ? string : T[K] extends Date | null ? string | null : T[K];
};

export type MenuDto = Serialized<Menu>;
export type PickDto = Serialized<Pick>;
/** 클라이언트에 내려보내는 회식 정보. id는 숨기고 slug만 노출한다. */
export type EventDto = Serialized<Omit<Event, "id">>;

export interface EventPayload {
  event: EventDto;
  menus: MenuDto[];
  picks: PickDto[];
}

function serialize<T extends object>(row: T): Serialized<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v;
  return out as Serialized<T>;
}

export function toPublic(e: Event): EventDto {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...rest } = e;
  return serialize(rest);
}

export async function findEventBySlug(slug: string): Promise<Event | null> {
  const db = getDb();
  const rows = await db.select().from(events).where(eq(events.slug, slug)).limit(1);
  return rows[0] ?? null;
}

/** 폴링 한 번에 필요한 전부 — 회식·메뉴·장바구니. 쿼리 2개를 병렬로 보낸다. */
export async function loadEventPayload(event: Event): Promise<EventPayload> {
  const db = getDb();
  const [menuRows, pickRows] = await Promise.all([
    db
      .select()
      .from(menus)
      .where(eq(menus.eventId, event.id))
      .orderBy(asc(menus.sortOrder), asc(menus.id)),
    db.select().from(picks).where(eq(picks.eventId, event.id)).orderBy(asc(picks.id)),
  ]);
  return { event: toPublic(event), menus: menuRows.map(serialize), picks: pickRows.map(serialize) };
}

/**
 * 네이버 메뉴를 `(eventId, naverItemId)` 기준으로 upsert 한다.
 * 삭제는 하지 않는다 — 사라진 메뉴를 이미 담은 사람이 있을 수 있다.
 */
export async function upsertNaverMenus(eventId: number, parsed: ParsedMenu[]): Promise<number> {
  if (parsed.length === 0) return 0;
  const db = getDb();
  await db
    .insert(menus)
    .values(
      parsed.map((m) => ({
        eventId,
        naverItemId: m.naverItemId,
        name: m.name,
        description: m.description,
        priceText: m.priceText,
        price: m.price,
        imageUrl: m.imageUrl,
        categoryName: m.categoryName,
        sortOrder: m.sortOrder,
        source: "naver" as const,
      })),
    )
    .onConflictDoUpdate({
      target: [menus.eventId, menus.naverItemId],
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        priceText: sql`excluded.price_text`,
        price: sql`excluded.price`,
        imageUrl: sql`excluded.image_url`,
        categoryName: sql`excluded.category_name`,
        sortOrder: sql`excluded.sort_order`,
      },
    });
  return parsed.length;
}

export interface CreateEventResult {
  slug: string;
  menuCount: number;
  /** 메뉴 수집이 실패했지만 장소는 알아낸 경우의 사유. */
  menuError: string | null;
}

/**
 * 링크 해석 → 메뉴 수집 → 회식 생성.
 * 장소 이름조차 못 얻으면 throw(호출자가 400). 메뉴가 0개면 생성은 하고 menuCount=0.
 */
export async function createEvent(input: { title?: string; naverUrl: string }): Promise<CreateEventResult> {
  const { placeId, resolvedUrl } = await resolvePlaceId(input.naverUrl);
  const page = await fetchPlaceMenus(placeId);
  if (!page.place) throw new Error("장소 정보를 읽지 못했습니다.");

  const db = getDb();
  const title = input.title?.trim() || `${page.place.name} 회식`;
  const [created] = await db
    .insert(events)
    .values({
      slug: newSlug(),
      title,
      naverUrl: resolvedUrl,
      placeId,
      placeName: page.place.name,
      placeCategory: page.place.category,
      placeAddress: page.place.address,
      menuSyncedAt: new Date(),
    })
    .returning();

  const menuCount = await upsertNaverMenus(created.id, page.menus);
  return { slug: created.slug, menuCount, menuError: null };
}

/** 메뉴 다시 가져오기. 성공하면 menuSyncedAt 갱신. */
export async function syncEventMenus(event: Event): Promise<{ menuCount: number }> {
  const page = await fetchPlaceMenus(event.placeId);
  const menuCount = await upsertNaverMenus(event.id, page.menus);
  const db = getDb();
  await db
    .update(events)
    .set({
      menuSyncedAt: new Date(),
      ...(page.place
        ? { placeName: page.place.name, placeCategory: page.place.category, placeAddress: page.place.address }
        : {}),
    })
    .where(eq(events.id, event.id));
  return { menuCount };
}

export async function addCustomMenu(
  event: Event,
  input: { name: string; price?: number | null; memberName: string },
): Promise<MenuDto> {
  const db = getDb();
  // 직접 추가 메뉴는 네이버 메뉴 뒤에 붙는다 — 현재 최대 sortOrder + 1.
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${menus.sortOrder}), -1) + 1` })
    .from(menus)
    .where(eq(menus.eventId, event.id));
  const [row] = await db
    .insert(menus)
    .values({
      eventId: event.id,
      name: input.name,
      price: input.price ?? null,
      priceText: input.price != null ? `${input.price.toLocaleString("ko-KR")}원` : null,
      sortOrder: Number(next),
      source: "custom",
      addedBy: input.memberName,
    })
    .returning();
  return serialize(row);
}

/** 수량 upsert. 0이면 삭제. 메뉴가 이 회식 것이 아니면 null. */
export async function setPick(
  event: Event,
  input: { menuId: number; memberName: string; quantity: number },
): Promise<PickDto | null | "not-found"> {
  const db = getDb();
  const [menu] = await db
    .select({ id: menus.id })
    .from(menus)
    .where(sql`${menus.id} = ${input.menuId} and ${menus.eventId} = ${event.id}`)
    .limit(1);
  if (!menu) return "not-found";

  if (input.quantity === 0) {
    await db
      .delete(picks)
      .where(
        sql`${picks.eventId} = ${event.id} and ${picks.menuId} = ${input.menuId} and ${picks.memberName} = ${input.memberName}`,
      );
    return null;
  }

  const [row] = await db
    .insert(picks)
    .values({
      eventId: event.id,
      menuId: input.menuId,
      memberName: input.memberName,
      quantity: input.quantity,
    })
    .onConflictDoUpdate({
      target: [picks.eventId, picks.menuId, picks.memberName],
      set: { quantity: input.quantity, updatedAt: new Date() },
    })
    .returning();
  return serialize(row);
}
