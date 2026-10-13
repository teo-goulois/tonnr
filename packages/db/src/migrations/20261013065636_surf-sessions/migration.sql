CREATE TABLE "surf_session" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"break_id" text,
	"spot_id" text,
	"place_name" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"rating" smallint,
	"note" text,
	"conditions" jsonb,
	"conditions_taken_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "surf_session_userId_startedAt_idx" ON "surf_session" ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "surf_session_breakId_idx" ON "surf_session" ("break_id");--> statement-breakpoint
CREATE INDEX "surf_session_spotId_idx" ON "surf_session" ("spot_id");--> statement-breakpoint
ALTER TABLE "surf_session" ADD CONSTRAINT "surf_session_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "surf_session" ADD CONSTRAINT "surf_session_break_id_surf_break_id_fkey" FOREIGN KEY ("break_id") REFERENCES "surf_break"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "surf_session" ADD CONSTRAINT "surf_session_spot_id_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "spot"("id") ON DELETE SET NULL;