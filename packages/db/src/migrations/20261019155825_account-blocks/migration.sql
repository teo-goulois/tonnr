CREATE TABLE "account_block" (
	"blocker_id" text,
	"blocked_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_block_pkey" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "account_block_not_self" CHECK ("blocker_id" <> "blocked_id")
);
--> statement-breakpoint
CREATE INDEX "account_block_blockedId_idx" ON "account_block" ("blocked_id");--> statement-breakpoint
ALTER TABLE "account_block" ADD CONSTRAINT "account_block_blocker_id_user_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "account_block" ADD CONSTRAINT "account_block_blocked_id_user_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "user"("id") ON DELETE CASCADE;