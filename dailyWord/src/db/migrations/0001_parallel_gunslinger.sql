CREATE TABLE "fortunes" (
	"id" serial PRIMARY KEY NOT NULL,
	"word_id" integer NOT NULL,
	"fortune" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fortunes" ADD CONSTRAINT "fortunes_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE no action ON UPDATE no action;