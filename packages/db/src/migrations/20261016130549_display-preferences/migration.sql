-- How much of the forecast a panel shows, chosen once for every device: decision 061.
CREATE TABLE "display_preferences" (
	"user_id" text PRIMARY KEY,
	"density" text DEFAULT 'details' NOT NULL,
	"saved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "display_preferences" ADD CONSTRAINT "display_preferences_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;