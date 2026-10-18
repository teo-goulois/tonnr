CREATE TABLE "media" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"kind" text NOT NULL,
	"state" text DEFAULT 'awaiting_upload' NOT NULL,
	"session_id" text,
	"position" smallint DEFAULT 0 NOT NULL,
	"upload_key" text NOT NULL,
	"upload_type" text NOT NULL,
	"upload_bytes" bigint NOT NULL,
	"upload_etag" text,
	"files" jsonb DEFAULT '{}' NOT NULL,
	"bytes" bigint DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"failure" text,
	"claim" text,
	"claimed_until" timestamp with time zone,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	CONSTRAINT "media_session_purpose" CHECK ("session_id" is null or "purpose" = 'session')
);
--> statement-breakpoint
CREATE TABLE "media_pause" (
	"id" text PRIMARY KEY DEFAULT 'instance',
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_pause_one_row" CHECK ("id" = 'instance')
);
--> statement-breakpoint
CREATE TABLE "media_trash" (
	"id" bigserial PRIMARY KEY,
	"keys" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "media_userId_idx" ON "media" ("user_id");--> statement-breakpoint
CREATE INDEX "media_sessionId_idx" ON "media" ("session_id");--> statement-breakpoint
CREATE INDEX "media_waiting_idx" ON "media" ("uploaded_at") WHERE "state" = 'uploaded';--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_session_id_surf_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "surf_session"("id") ON DELETE CASCADE;--> statement-breakpoint
-- A medium that goes, by whatever way, leaves the keys of its files for the worker to delete:
-- decision 066. One row of keys for each statement that deleted some.
CREATE FUNCTION "media_to_trash"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "media_trash" ("keys")
  SELECT array_agg("key")
  FROM (
    SELECT "upload_key" AS "key" FROM "gone"
    UNION ALL
    SELECT "file"."value" ->> 'key' FROM "gone", jsonb_each("gone"."files") AS "file"
  ) AS "keys"
  WHERE "key" IS NOT NULL
  HAVING count(*) > 0;
  RETURN NULL;
END
$$;--> statement-breakpoint
CREATE TRIGGER "media_to_trash" AFTER DELETE ON "media" REFERENCING OLD TABLE AS "gone" FOR EACH STATEMENT EXECUTE FUNCTION "media_to_trash"();
