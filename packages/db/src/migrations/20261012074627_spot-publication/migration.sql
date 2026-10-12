CREATE TABLE "spot_publication" (
	"id" text PRIMARY KEY,
	"spot_id" text NOT NULL,
	"user_id" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"break_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "spot_publication_spotId_createdAt_idx" ON "spot_publication" ("spot_id","created_at");--> statement-breakpoint
CREATE INDEX "spot_publication_status_createdAt_idx" ON "spot_publication" ("status","created_at");--> statement-breakpoint
CREATE INDEX "spot_publication_userId_idx" ON "spot_publication" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "spot_publication_pending_idx" ON "spot_publication" ("spot_id") WHERE "status" = 'pending';--> statement-breakpoint
ALTER TABLE "spot_publication" ADD CONSTRAINT "spot_publication_spot_id_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "spot"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "spot_publication" ADD CONSTRAINT "spot_publication_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "spot_publication" ADD CONSTRAINT "spot_publication_decided_by_user_id_fkey" FOREIGN KEY ("decided_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "spot_publication" ADD CONSTRAINT "spot_publication_break_id_surf_break_id_fkey" FOREIGN KEY ("break_id") REFERENCES "surf_break"("id") ON DELETE SET NULL;