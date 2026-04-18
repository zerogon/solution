CREATE TABLE IF NOT EXISTS "page_views" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "page" varchar(30) NOT NULL,
  "viewed_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_page_views_viewed_at" ON "page_views" ("viewed_at");
CREATE INDEX IF NOT EXISTS "idx_page_views_page" ON "page_views" ("page");
