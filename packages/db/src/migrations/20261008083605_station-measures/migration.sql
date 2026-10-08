ALTER TABLE "station" ADD COLUMN "reports_waves" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "station" ADD COLUMN "reports_wind" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "station" SET "reports_waves" = true WHERE EXISTS (SELECT 1 FROM "reading" WHERE "reading"."station_id" = "station"."id" AND "reading"."significant_height_m" IS NOT NULL);--> statement-breakpoint
UPDATE "station" SET "reports_wind" = true WHERE EXISTS (SELECT 1 FROM "reading" WHERE "reading"."station_id" = "station"."id" AND "reading"."wind_speed_ms" IS NOT NULL);
