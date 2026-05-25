CREATE TABLE IF NOT EXISTS "zodiac_fortunes" (
	"id" serial PRIMARY KEY NOT NULL,
	"zodiac_key" varchar(10) NOT NULL,
	"day_of_year" integer NOT NULL,
	"overall" text NOT NULL,
	"love" text NOT NULL,
	"money" text NOT NULL,
	"health" text NOT NULL,
	"overall_score" integer NOT NULL,
	"love_score" integer NOT NULL,
	"money_score" integer NOT NULL,
	"health_score" integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_zodiac_day" ON "zodiac_fortunes" USING btree ("zodiac_key","day_of_year");
