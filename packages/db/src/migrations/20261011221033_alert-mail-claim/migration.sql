ALTER TABLE "alert_spot" ADD COLUMN "mail_begun" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_delivery" ADD COLUMN "claim" jsonb;