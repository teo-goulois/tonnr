CREATE TABLE "alert" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"shortest_minutes" integer DEFAULT 120 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"looked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_settings" (
	"user_id" text PRIMARY KEY,
	"horizon_days" integer DEFAULT 3 NOT NULL,
	"zone" text,
	"locale" text,
	"on_found" boolean DEFAULT true NOT NULL,
	"on_evening" boolean DEFAULT true NOT NULL,
	"evening_minutes" integer DEFAULT 1140 NOT NULL,
	"on_change" boolean DEFAULT true NOT NULL,
	"on_begin" boolean DEFAULT true NOT NULL,
	"notice_minutes" integer DEFAULT 0 NOT NULL,
	"daylight_only" boolean DEFAULT true NOT NULL,
	"week" jsonb,
	"away_until" timestamp with time zone,
	"quiet_from" integer DEFAULT 1320,
	"quiet_to" integer DEFAULT 420,
	"by_mail" boolean,
	"names_in_subject" boolean DEFAULT true NOT NULL,
	"by_push" boolean DEFAULT false NOT NULL,
	"evening_until" timestamp with time zone,
	"mail_token_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_spot" (
	"spot_id" text PRIMARY KEY,
	"alert_id" text NOT NULL,
	"position" integer NOT NULL,
	"looked_at" timestamp with time zone,
	"told" jsonb DEFAULT '[]' NOT NULL,
	"cut_by" text,
	"begun" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_window" (
	"alert_id" text NOT NULL,
	"spot_id" text,
	"sea_start" timestamp with time zone,
	"sea_end" timestamp with time zone NOT NULL,
	"seen" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "alert_window_pkey" PRIMARY KEY("spot_id","sea_start")
);
--> statement-breakpoint
CREATE TABLE "alert_notification" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"alert_id" text,
	"moment" text NOT NULL,
	"key" text NOT NULL UNIQUE,
	"payload" jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alert_delivery" (
	"notification_id" text,
	"channel" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "alert_delivery_pkey" PRIMARY KEY("notification_id","channel")
);
--> statement-breakpoint
ALTER TABLE "spot" ALTER COLUMN "criteria" SET DEFAULT '{}';--> statement-breakpoint
CREATE INDEX "alert_userId_idx" ON "alert" ("user_id");--> statement-breakpoint
CREATE INDEX "alert_spot_alertId_idx" ON "alert_spot" ("alert_id");--> statement-breakpoint
CREATE INDEX "alert_window_alertId_idx" ON "alert_window" ("alert_id");--> statement-breakpoint
CREATE INDEX "alert_notification_userId_createdAt_idx" ON "alert_notification" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "alert_delivery_state_dueAt_idx" ON "alert_delivery" ("state","due_at");--> statement-breakpoint
ALTER TABLE "alert" ADD CONSTRAINT "alert_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alert_settings" ADD CONSTRAINT "alert_settings_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alert_spot" ADD CONSTRAINT "alert_spot_spot_id_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "spot"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alert_spot" ADD CONSTRAINT "alert_spot_alert_id_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alert"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alert_window" ADD CONSTRAINT "alert_window_alert_id_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alert"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alert_window" ADD CONSTRAINT "alert_window_spot_id_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "spot"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alert_notification" ADD CONSTRAINT "alert_notification_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "alert_notification" ADD CONSTRAINT "alert_notification_alert_id_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "alert"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "alert_delivery" ADD CONSTRAINT "alert_delivery_notification_id_alert_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "alert_notification"("id") ON DELETE CASCADE;--> statement-breakpoint
-- A spot that had criteria gets an alert of its name, with those criteria and the spot's switch:
-- decision 031. A range with neither end asks nothing and is left out, and a spot left with no
-- criteria gets no alert, its switch on or not: an alert that asks nothing of the sea would
-- speak at every hour. The ids are made once and read twice, which a CTE that calls a volatile
-- function guarantees. The spot keeps its two columns one release more, for the version that
-- still reads them while this one is deployed: decision 009.
WITH asked AS (
	SELECT "id", "user_id", "name", "alerts_enabled", COALESCE(
		(SELECT jsonb_object_agg("criterion"."key", "criterion"."value")
			FROM jsonb_each("spot"."criteria") AS "criterion"
			WHERE "criterion"."value" <> '{}'::jsonb),
		'{}'::jsonb
	) AS "criteria"
	FROM "spot"
), moved AS (
	SELECT gen_random_uuid()::text AS "alert_id", "id" AS "spot_id", "user_id", "name", "criteria", "alerts_enabled"
	FROM asked
	WHERE "criteria" <> '{}'::jsonb
), made AS (
	INSERT INTO "alert" ("id", "user_id", "name", "criteria", "enabled")
	SELECT "alert_id", "user_id", "name", "criteria", "alerts_enabled" FROM moved
	RETURNING "id"
)
INSERT INTO "alert_spot" ("spot_id", "alert_id", "position")
SELECT "spot_id", "alert_id", 0 FROM moved;
