CREATE TABLE "api_usage" (
	"hour" timestamp with time zone NOT NULL,
	"via" text NOT NULL,
	"key_id" text,
	"procedure" text NOT NULL,
	"outcome" text NOT NULL,
	"calls" integer NOT NULL,
	CONSTRAINT "api_usage_bucket" UNIQUE NULLS NOT DISTINCT("hour","via","key_id","procedure","outcome"),
	CONSTRAINT "api_usage_via_key" CHECK (("via" = 'key') = ("key_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "developer" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"contact" text,
	"note" text,
	"calls_per_hour" integer,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "developer_calls" (
	"hour" timestamp with time zone,
	"developer_id" text,
	"calls" integer NOT NULL,
	CONSTRAINT "developer_calls_pkey" PRIMARY KEY("hour","developer_id")
);
--> statement-breakpoint
ALTER TABLE "api_key" ADD COLUMN "developer_id" text;--> statement-breakpoint
CREATE INDEX "api_key_developerId_idx" ON "api_key" ("developer_id");--> statement-breakpoint
CREATE INDEX "api_usage_keyId_hour_idx" ON "api_usage" ("key_id","hour");--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_developer_id_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "developer"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_key_id_api_key_id_fkey" FOREIGN KEY ("key_id") REFERENCES "api_key"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "developer_calls" ADD CONSTRAINT "developer_calls_developer_id_developer_id_fkey" FOREIGN KEY ("developer_id") REFERENCES "developer"("id") ON DELETE CASCADE;--> statement-breakpoint
-- The keys that exist go to a developer account named after their maker, one for each maker.
-- The ids are drawn once, after the makers are told apart, and used twice.
WITH "maker" AS (
	SELECT "user_id" FROM "api_key" WHERE "developer_id" IS NULL GROUP BY "user_id"
), "named" AS MATERIALIZED (
	SELECT
		"maker"."user_id",
		gen_random_uuid()::text AS "id",
		coalesce(nullif(left(btrim(regexp_replace("user"."name", '[[:cntrl:]]', '', 'g')), 80), ''), 'Operator') AS "name"
	FROM "maker" INNER JOIN "user" ON "user"."id" = "maker"."user_id"
), "made" AS (
	INSERT INTO "developer" ("id", "name") SELECT "id", "name" FROM "named"
)
UPDATE "api_key" SET "developer_id" = "named"."id" FROM "named"
WHERE "api_key"."user_id" = "named"."user_id" AND "api_key"."developer_id" IS NULL;
