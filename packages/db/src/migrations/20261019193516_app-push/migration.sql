ALTER TABLE "alert" ADD COLUMN "away_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD COLUMN "kind" text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD COLUMN "token" text;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD COLUMN "environment" text;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD COLUMN "app_id" text;--> statement-breakpoint
ALTER TABLE "push_subscription" ALTER COLUMN "endpoint" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_token_key" UNIQUE("token");--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_kind_shape" CHECK (("kind" = 'web' and "endpoint" is not null and "token" is null and "environment" is null and "app_id" is null)
        or ("kind" = 'ios' and "endpoint" is null and "token" is not null and "environment" is not null and "environment" in ('development', 'production') and "app_id" is not null)
        or ("kind" = 'android' and "endpoint" is null and "token" is not null and "environment" is null and "app_id" is not null));