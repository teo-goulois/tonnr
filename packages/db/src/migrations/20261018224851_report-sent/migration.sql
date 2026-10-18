CREATE TABLE "report_sent" (
	"id" bigserial PRIMARY KEY,
	"user_id" text NOT NULL,
	"break_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "report_sent_userId_at_idx" ON "report_sent" ("user_id","at");--> statement-breakpoint
ALTER TABLE "report_sent" ADD CONSTRAINT "report_sent_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;