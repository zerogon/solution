import {
  pgTable,
  serial,
  text,
  integer,
  varchar,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const visits = pgTable(
  "visits",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    visitedAt: timestamp("visited_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: text("user_agent"),
  },
  (table) => [index("idx_visits_visited_at").on(table.visitedAt)]
);

export type Visit = typeof visits.$inferSelect;

export const zodiacFortunes = pgTable(
  "zodiac_fortunes",
  {
    id: serial("id").primaryKey(),
    zodiacKey: varchar("zodiac_key", { length: 10 }).notNull(),
    dayOfYear: integer("day_of_year").notNull(),
    overall: text("overall").notNull(),
    love: text("love").notNull(),
    money: text("money").notNull(),
    health: text("health").notNull(),
    overallScore: integer("overall_score").notNull(),
    loveScore: integer("love_score").notNull(),
    moneyScore: integer("money_score").notNull(),
    healthScore: integer("health_score").notNull(),
  },
  (table) => [
    uniqueIndex("uq_zodiac_day").on(table.zodiacKey, table.dayOfYear),
  ]
);

export type ZodiacFortune = typeof zodiacFortunes.$inferSelect;

export const dailySentences = pgTable(
  "daily_sentences",
  {
    id: serial("id").primaryKey(),
    text: text("text").notNull(),
    tag: varchar("tag", { length: 20 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_daily_sentences_tag").on(table.tag),
    index("idx_daily_sentences_active").on(table.isActive),
  ]
);

export type DailySentence = typeof dailySentences.$inferSelect;

export const pageViews = pgTable(
  "page_views",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    page: varchar("page", { length: 30 }).notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_page_views_viewed_at").on(table.viewedAt),
    index("idx_page_views_page").on(table.page),
  ]
);

export type PageView = typeof pageViews.$inferSelect;

export const ideas = pgTable(
  "ideas",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 100 }),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_ideas_created_at").on(table.createdAt)]
);

export type Idea = typeof ideas.$inferSelect;
