CREATE TABLE "unit_preferences" (
	"user_id" text PRIMARY KEY,
	"wind_speed" text NOT NULL,
	"saved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "unit_preferences" ADD CONSTRAINT "unit_preferences_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;