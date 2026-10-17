ALTER TABLE "alert_spot" ADD COLUMN "break_id" text;--> statement-breakpoint
ALTER TABLE "alert_spot" ADD COLUMN "place_id" text GENERATED ALWAYS AS (coalesce(spot_id, break_id)) STORED;--> statement-breakpoint
ALTER TABLE "alert_window" ADD COLUMN "break_id" text;--> statement-breakpoint
ALTER TABLE "alert_window" ADD COLUMN "place_id" text GENERATED ALWAYS AS (coalesce(spot_id, break_id)) STORED;--> statement-breakpoint
ALTER TABLE "alert_spot" DROP CONSTRAINT "alert_spot_pkey";--> statement-breakpoint
ALTER TABLE "alert_spot" ADD PRIMARY KEY ("place_id","alert_id");--> statement-breakpoint
ALTER TABLE "alert_window" DROP CONSTRAINT "alert_window_pkey";--> statement-breakpoint
ALTER TABLE "alert_window" ADD PRIMARY KEY ("place_id","alert_id","sea_start");--> statement-breakpoint
ALTER TABLE "alert_spot" ALTER COLUMN "spot_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_window" ALTER COLUMN "spot_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "alert_spot_breakId_idx" ON "alert_spot" ("break_id");--> statement-breakpoint
ALTER TABLE "alert_spot" ADD CONSTRAINT "alert_spot_break_id_surf_break_id_fkey" FOREIGN KEY ("break_id") REFERENCES "surf_break"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alert_window" ADD CONSTRAINT "alert_window_break_id_surf_break_id_fkey" FOREIGN KEY ("break_id") REFERENCES "surf_break"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alert_spot" ADD CONSTRAINT "alert_spot_one_place" CHECK (("spot_id" is null) <> ("break_id" is null));--> statement-breakpoint
ALTER TABLE "alert_window" ADD CONSTRAINT "alert_window_one_place" CHECK (("spot_id" is null) <> ("break_id" is null));