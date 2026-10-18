CREATE TABLE "report_sent" (
	"id" bigserial PRIMARY KEY,
	"user_id" text NOT NULL,
	"break_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "report_sent_userId_at_idx" ON "report_sent" ("user_id","at");--> statement-breakpoint
ALTER TABLE "report_sent" ADD CONSTRAINT "report_sent_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
-- The reports of the last day count from the start, so that the limits hold across the upgrade.
INSERT INTO "report_sent" ("user_id", "break_id", "at")
SELECT "user_id", "break_id", "created_at" FROM "surf_report" WHERE "created_at" > now() - interval '1 day';
