CREATE TABLE "recent_view" (
	"user_id" text,
	"kind" text,
	"target_id" text,
	"viewed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "recent_view_pkey" PRIMARY KEY("user_id","kind","target_id")
);
--> statement-breakpoint
CREATE INDEX "recent_view_userId_viewedAt_idx" ON "recent_view" ("user_id","viewed_at");--> statement-breakpoint
ALTER TABLE "recent_view" ADD CONSTRAINT "recent_view_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;