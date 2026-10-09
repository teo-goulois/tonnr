CREATE TABLE "developer_member" (
	"developer_id" text,
	"user_id" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"operator_id" text,
	CONSTRAINT "developer_member_pkey" PRIMARY KEY("developer_id","user_id")
);
--> statement-breakpoint
CREATE INDEX "developer_member_userId_idx" ON "developer_member" ("user_id");--> statement-breakpoint
ALTER TABLE "developer_member" ADD CONSTRAINT "developer_member_developer_id_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "developer"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "developer_member" ADD CONSTRAINT "developer_member_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "developer_member" ADD CONSTRAINT "developer_member_operator_id_user_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "user"("id") ON DELETE SET NULL;