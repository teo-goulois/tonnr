CREATE TABLE "push_subscription" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL UNIQUE,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_spot" ADD COLUMN "pushed" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_spot" ADD COLUMN "push_begun" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "alert_window" DROP CONSTRAINT "alert_window_pkey";--> statement-breakpoint
ALTER TABLE "alert_window" ADD PRIMARY KEY ("spot_id","alert_id","sea_start");--> statement-breakpoint
ALTER TABLE "alert_spot" DROP CONSTRAINT "alert_spot_pkey";--> statement-breakpoint
ALTER TABLE "alert_spot" ADD PRIMARY KEY ("spot_id","alert_id");--> statement-breakpoint
CREATE INDEX "push_subscription_userId_idx" ON "push_subscription" ("user_id");--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;