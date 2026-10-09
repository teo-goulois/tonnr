CREATE TABLE "account_suspension" (
	"user_id" text PRIMARY KEY,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"operator_id" text
);
--> statement-breakpoint
ALTER TABLE "operator_action" ADD COLUMN "account_id" text;--> statement-breakpoint
CREATE INDEX "operator_action_accountId_at_idx" ON "operator_action" ("account_id","at","id");--> statement-breakpoint
ALTER TABLE "account_suspension" ADD CONSTRAINT "account_suspension_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "account_suspension" ADD CONSTRAINT "account_suspension_operator_id_user_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "user"("id") ON DELETE SET NULL;