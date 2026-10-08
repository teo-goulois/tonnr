CREATE TABLE "surf_break" (
	"id" text PRIMARY KEY,
	"provider" text NOT NULL,
	"provider_ref" text NOT NULL,
	"name" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"source_url" text NOT NULL,
	"license_type" text NOT NULL,
	"license_url" text NOT NULL,
	"attribution" text NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "spot" ADD COLUMN "break_id" text;--> statement-breakpoint
CREATE INDEX "spot_breakId_idx" ON "spot" ("break_id");--> statement-breakpoint
CREATE UNIQUE INDEX "surf_break_provider_ref_idx" ON "surf_break" ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX "surf_break_position_idx" ON "surf_break" ("latitude","longitude");--> statement-breakpoint
ALTER TABLE "spot" ADD CONSTRAINT "spot_break_id_surf_break_id_fkey" FOREIGN KEY ("break_id") REFERENCES "surf_break"("id") ON DELETE SET NULL;