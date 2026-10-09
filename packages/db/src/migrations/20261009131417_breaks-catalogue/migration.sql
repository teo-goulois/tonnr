CREATE TABLE "surf_break_record" (
	"break_id" text PRIMARY KEY,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "surf_break" ADD COLUMN "break_types" text[];--> statement-breakpoint
ALTER TABLE "surf_break" ADD COLUMN "wave_directions" text[];--> statement-breakpoint
ALTER TABLE "surf_break" ADD COLUMN "bottom_types" text[];--> statement-breakpoint
ALTER TABLE "surf_break" ADD COLUMN "ability_levels" text[];--> statement-breakpoint
ALTER TABLE "surf_break" ADD COLUMN "board_types" text[];--> statement-breakpoint
ALTER TABLE "surf_break" ADD COLUMN "best_seasons" text[];--> statement-breakpoint
ALTER TABLE "surf_break" ADD COLUMN "best_tides" text[];--> statement-breakpoint
ALTER TABLE "surf_break" ADD COLUMN "best_swell_directions" text[];--> statement-breakpoint
ALTER TABLE "surf_break" ADD COLUMN "best_wind_directions" text[];--> statement-breakpoint
ALTER TABLE "surf_break" ADD COLUMN "offshore_direction_degrees" integer;--> statement-breakpoint
ALTER TABLE "surf_break" ADD COLUMN "location" text[];--> statement-breakpoint
ALTER TABLE "surf_break" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "surf_break" ALTER COLUMN "provider" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "surf_break" ALTER COLUMN "provider_ref" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "surf_break" ALTER COLUMN "source_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "surf_break" ALTER COLUMN "license_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "surf_break" ALTER COLUMN "license_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "surf_break" ALTER COLUMN "attribution" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "surf_break" ALTER COLUMN "last_seen_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "surf_break_record" ADD CONSTRAINT "surf_break_record_break_id_surf_break_id_fkey" FOREIGN KEY ("break_id") REFERENCES "surf_break"("id") ON DELETE CASCADE;