CREATE TABLE "account_block" (
	"id" text PRIMARY KEY,
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"username" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_block_not_self" CHECK ("blocker_id" <> "blocked_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_block_blockerId_blockedId_idx" ON "account_block" ("blocker_id","blocked_id");--> statement-breakpoint
CREATE INDEX "account_block_blockedId_idx" ON "account_block" ("blocked_id");--> statement-breakpoint
ALTER TABLE "account_block" ADD CONSTRAINT "account_block_blocker_id_user_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "account_block" ADD CONSTRAINT "account_block_blocked_id_user_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "user"("id") ON DELETE CASCADE;