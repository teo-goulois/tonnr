ALTER TABLE "alert_settings" ADD COLUMN "mail_key" text;--> statement-breakpoint
ALTER TABLE "alert_spot" ADD COLUMN "mailed" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_spot" ADD COLUMN "forecast_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "alert_window" ADD COLUMN "hours" jsonb DEFAULT '[]' NOT NULL;