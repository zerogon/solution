CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"word_id" integer NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "selections" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"word_id" integer NOT NULL,
	"selected_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"visited_at" timestamp DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "words" (
	"id" serial PRIMARY KEY NOT NULL,
	"word" text NOT NULL,
	"display_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_selections_selected_at" ON "selections" USING btree ("selected_at");--> statement-breakpoint
CREATE INDEX "idx_selections_session" ON "selections" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_visits_visited_at" ON "visits" USING btree ("visited_at");