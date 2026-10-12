ALTER TABLE "push_subscription" ADD COLUMN "session_id" text;--> statement-breakpoint
CREATE INDEX "push_subscription_sessionId_idx" ON "push_subscription" ("session_id");--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_session_id_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "session"("id") ON DELETE CASCADE;