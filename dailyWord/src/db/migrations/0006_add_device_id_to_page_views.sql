ALTER TABLE "page_views" ADD COLUMN IF NOT EXISTS "device_id" text;

CREATE INDEX IF NOT EXISTS "idx_page_views_device_id" ON "page_views" ("device_id");
