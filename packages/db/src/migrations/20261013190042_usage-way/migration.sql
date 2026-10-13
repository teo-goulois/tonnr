ALTER TABLE "api_usage" ADD COLUMN "way" text DEFAULT 'api' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_usage" DROP CONSTRAINT "api_usage_bucket";--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_bucket" UNIQUE NULLS NOT DISTINCT("hour","via","way","key_id","procedure","outcome");