CREATE TABLE "operator_action" (
	"id" text PRIMARY KEY,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"operator_id" text,
	"action" text NOT NULL,
	"developer_id" text,
	"developer_name" text,
	"key_id" text,
	"key_name" text,
	"changes" jsonb
);
--> statement-breakpoint
CREATE INDEX "operator_action_at_idx" ON "operator_action" ("at");--> statement-breakpoint
CREATE INDEX "operator_action_developerId_at_idx" ON "operator_action" ("developer_id","at");--> statement-breakpoint
ALTER TABLE "operator_action" ADD CONSTRAINT "operator_action_operator_id_user_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "user"("id") ON DELETE SET NULL;