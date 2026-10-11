ALTER TABLE "unit_preferences" ADD COLUMN "height" text DEFAULT 'm' NOT NULL;--> statement-breakpoint
ALTER TABLE "unit_preferences" ADD COLUMN "temperature" text DEFAULT 'c' NOT NULL;--> statement-breakpoint
ALTER TABLE "unit_preferences" ADD COLUMN "distance" text DEFAULT 'km' NOT NULL;--> statement-breakpoint
ALTER TABLE "unit_preferences" ADD COLUMN "precipitation" text DEFAULT 'mm' NOT NULL;