CREATE TABLE "saved_shortcuts" (
	"user_id" text PRIMARY KEY,
	"overrides" jsonb NOT NULL,
	"saved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_shortcuts" ADD CONSTRAINT "saved_shortcuts_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;