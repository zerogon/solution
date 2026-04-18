CREATE TABLE IF NOT EXISTS "daily_sentences" (
  "id" serial PRIMARY KEY NOT NULL,
  "text" text NOT NULL,
  "tag" varchar(20) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_daily_sentences_tag" ON "daily_sentences" ("tag");
CREATE INDEX IF NOT EXISTS "idx_daily_sentences_active" ON "daily_sentences" ("is_active");
