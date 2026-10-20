CREATE TABLE "live_activity" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"device_id" text NOT NULL,
	"notification_id" text NOT NULL,
	"alert_id" text,
	"alert_revision" integer NOT NULL,
	"place_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"token" text UNIQUE,
	"lasts_until" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"shown" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_activity_device_notification_key" UNIQUE("device_id","notification_id")
);
--> statement-breakpoint
ALTER TABLE "push_subscription" ADD COLUMN "activity_start_token" text;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_activity_start_token_key" UNIQUE("activity_start_token");--> statement-breakpoint
CREATE INDEX "live_activity_userId_idx" ON "live_activity" ("user_id");--> statement-breakpoint
CREATE INDEX "live_activity_alertId_idx" ON "live_activity" ("alert_id");--> statement-breakpoint
CREATE INDEX "live_activity_running_idx" ON "live_activity" ("device_id","alert_id") WHERE "ended_at" is null;--> statement-breakpoint
ALTER TABLE "live_activity" ADD CONSTRAINT "live_activity_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "live_activity" ADD CONSTRAINT "live_activity_device_id_push_subscription_id_fkey" FOREIGN KEY ("device_id") REFERENCES "push_subscription"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "live_activity" ADD CONSTRAINT "live_activity_notification_id_alert_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "alert_notification"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "live_activity" ADD CONSTRAINT "live_activity_alert_id_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alert"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "push_subscription" DROP CONSTRAINT "push_subscription_kind_shape", ADD CONSTRAINT "push_subscription_kind_shape" CHECK (("kind" = 'web' and "endpoint" is not null and "token" is null and "environment" is null and "app_id" is null and "activity_start_token" is null)
        or ("kind" = 'ios' and "endpoint" is null and "token" is not null and "environment" is not null and "environment" in ('development', 'production') and "app_id" is not null)
        or ("kind" = 'android' and "endpoint" is null and "token" is not null and "environment" is null and "app_id" is not null and "activity_start_token" is null));