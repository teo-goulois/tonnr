-- A break has an address, `/spots/<country>/<region>/<slug>`, written once from its places and
-- its name, and an address a merged break had leads to the break that stays: decision 057.
CREATE TABLE "surf_break_alias" (
	"country_slug" text,
	"region_slug" text,
	"slug" text,
	"break_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surf_break_alias_pkey" PRIMARY KEY("country_slug","region_slug","slug")
);
--> statement-breakpoint
ALTER TABLE "surf_break" ADD COLUMN "country_slug" text;--> statement-breakpoint
ALTER TABLE "surf_break" ADD COLUMN "region_slug" text;--> statement-breakpoint
ALTER TABLE "surf_break" ADD COLUMN "slug" text;--> statement-breakpoint
-- A name as `slugify` in @repo/config/names writes it, for the breaks that are there: the
-- same letters read the same way, so that a break added later by the code gets the same slug.
-- The function lives in the session alone and goes with it.
CREATE FUNCTION pg_temp.slug(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT trim(both '-' from regexp_replace(lower(translate(replace(replace(replace(replace(replace(t, 'æ', 'ae'), 'Æ', 'ae'), 'œ', 'oe'), 'Œ', 'oe'), 'ß', 'ss'), 'àáâãäåçèéêëìíîïñòóôõöùúûüýÿÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ-''’øØłŁđĐğĞşŞıİțȚșȘčČćĆžŽšŠăĂāĀēĒīĪōŌūŪőŐűŰěĚřŘůŮąĄęĘńŃśŚźŹżŻ', 'aaaaaaceeeeiiiinooooouuuuyyaaaaaaceeeeiiiinooooouuuuy   oollddggssiittsscccczzssaaaaeeiioouuoouueerruuaaeennsszzzz')), '[^a-z0-9]+', '-', 'g')) $$;--> statement-breakpoint
UPDATE "surf_break" SET
	"country_slug" = nullif(pg_temp.slug("location"[1]), ''),
	"region_slug" = coalesce(nullif(pg_temp.slug("location"[2]), ''), nullif(pg_temp.slug("location"[1]), '')),
	"slug" = coalesce(nullif(pg_temp.slug("name"), ''), 'spot-' || left("id", 6));--> statement-breakpoint
-- A second break of one name in one region adds its nearest place to its slug, the first keeps it.
WITH ranked AS (
	SELECT "id", row_number() OVER (PARTITION BY "country_slug", "region_slug", "slug" ORDER BY "created_at", "id") AS n
	FROM "surf_break"
)
UPDATE "surf_break" b SET "slug" = b."slug" || '-' || pg_temp.slug(b."location"[cardinality(b."location")])
FROM ranked r
WHERE r."id" = b."id" AND r.n > 1
	AND cardinality(b."location") > 2
	AND nullif(pg_temp.slug(b."location"[cardinality(b."location")]), '') IS NOT NULL
	AND pg_temp.slug(b."location"[cardinality(b."location")]) <> b."slug";--> statement-breakpoint
-- A slug still taken adds the first six characters of the break's id.
WITH ranked AS (
	SELECT "id", row_number() OVER (PARTITION BY "country_slug", "region_slug", "slug" ORDER BY "created_at", "id") AS n
	FROM "surf_break"
)
UPDATE "surf_break" b SET "slug" = b."slug" || '-' || left(b."id", 6)
FROM ranked r
WHERE r."id" = b."id" AND r.n > 1;--> statement-breakpoint
ALTER TABLE "surf_break" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "surf_break_address_idx" ON "surf_break" ("country_slug","region_slug","slug");--> statement-breakpoint
CREATE INDEX "surf_break_alias_breakId_idx" ON "surf_break_alias" ("break_id");--> statement-breakpoint
ALTER TABLE "surf_break_alias" ADD CONSTRAINT "surf_break_alias_break_id_surf_break_id_fkey" FOREIGN KEY ("break_id") REFERENCES "surf_break"("id") ON DELETE CASCADE;
