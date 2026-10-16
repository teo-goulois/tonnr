CREATE TABLE "surfer_profile" (
	"user_id" text PRIMARY KEY,
	"level" text,
	"smallest_wave" text,
	"biggest_wave" text,
	"reading" text,
	"boards" text[],
	"answered_at" timestamp with time zone,
	"put_off_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "surfer_profile" ADD CONSTRAINT "surfer_profile_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;