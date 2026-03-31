import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const words = pgTable("words", {
  id: serial("id").primaryKey(),
  word: text("word").notNull(),
  displayOrder: integer("display_order").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  wordId: integer("word_id")
    .notNull()
    .references(() => words.id),
  message: text("message").notNull(),
});

export const visits = pgTable(
  "visits",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    visitedAt: timestamp("visited_at").notNull().defaultNow(),
    userAgent: text("user_agent"),
  },
  (table) => [index("idx_visits_visited_at").on(table.visitedAt)]
);

export const selections = pgTable(
  "selections",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    wordId: integer("word_id")
      .notNull()
      .references(() => words.id),
    selectedAt: timestamp("selected_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_selections_selected_at").on(table.selectedAt),
    index("idx_selections_session").on(table.sessionId),
  ]
);

export type Word = typeof words.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Visit = typeof visits.$inferSelect;
export type Selection = typeof selections.$inferSelect;
