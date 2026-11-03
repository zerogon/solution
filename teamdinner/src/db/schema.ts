import {
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** 메뉴 출처 — 네이버에서 가져온 것인지, 팀원이 직접 추가한 것인지. */
export const menuSourceEnum = pgEnum("menu_source", ["naver", "custom"]);

/** 회식 한 건. slug가 공유 링크(`/e/<slug>`)이자 유일한 접근 제어다. */
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  naverUrl: text("naver_url").notNull(),
  placeId: text("place_id").notNull(),
  placeName: text("place_name").notNull(),
  placeCategory: text("place_category"),
  placeAddress: text("place_address"),
  /** 마지막으로 네이버 메뉴를 성공적으로 가져온 시각. null이면 한 번도 성공 못 함. */
  menuSyncedAt: timestamp("menu_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const menus = pgTable(
  "menus",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    /** 네이버 PlaceMenuItem.id — 재동기화 upsert 키. 직접 추가 메뉴는 null. */
    naverItemId: text("naver_item_id"),
    name: text("name").notNull(),
    description: text("description"),
    /** 네이버가 준 가격 원문("48,000원", "변동"). 화면 표시는 price가 우선. */
    priceText: text("price_text"),
    /** 원 단위 정수. 가격을 알 수 없으면 null — 합계에서 제외되고 "가격 미정"으로 표시. */
    price: integer("price"),
    imageUrl: text("image_url"),
    categoryName: text("category_name"),
    sortOrder: integer("sort_order").notNull().default(0),
    source: menuSourceEnum("source").notNull().default("naver"),
    /** 직접 추가한 사람 이름. 네이버 메뉴는 null. */
    addedBy: text("added_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_menus_event").on(t.eventId),
    uniqueIndex("uq_menus_event_naver_item").on(t.eventId, t.naverItemId),
  ],
);

/** 장바구니 항목 — 사람×메뉴 당 1행이고 수량만 바뀐다. */
export const picks = pgTable(
  "picks",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    menuId: integer("menu_id")
      .notNull()
      .references(() => menus.id, { onDelete: "cascade" }),
    memberName: text("member_name").notNull(),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_picks_event").on(t.eventId),
    uniqueIndex("uq_picks_event_menu_member").on(t.eventId, t.menuId, t.memberName),
  ],
);

export type Event = typeof events.$inferSelect;
export type Menu = typeof menus.$inferSelect;
export type Pick = typeof picks.$inferSelect;
