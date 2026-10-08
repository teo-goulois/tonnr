ALTER TABLE "station" ADD COLUMN "moved_at" timestamp with time zone;--> statement-breakpoint
-- An open station now stays open. The ones the first rule called open, some of them from a day
-- that was not over, start again.
UPDATE "station" SET "exposure" = NULL WHERE "exposure" = 'open';
