-- The break a contribution was written of, by the id it had: kept once the break has left the
-- catalogue. A row written before this takes its break's id, or its own once the break is gone.
ALTER TABLE "break_contribution" ADD COLUMN "break_ref" text;--> statement-breakpoint
UPDATE "break_contribution" SET "break_ref" = coalesce("break_id", "id");--> statement-breakpoint
ALTER TABLE "break_contribution" ALTER COLUMN "break_ref" SET NOT NULL;--> statement-breakpoint
-- A spot that an operator accepted and that has no row yet gets one: the version before this
-- one writes none, and may have accepted a spot since the first of these rows were written. A
-- request whose break has left the catalogue is counted too, under the spot's name. The API does
-- the same each time it starts.
INSERT INTO "break_contribution" ("id", "break_id", "break_ref", "user_id", "line", "value", "status", "license", "decided_by", "decided_at", "confirmed_at", "created_at")
SELECT gen_random_uuid()::text, p."break_id", coalesce(p."break_id", p."id"), p."user_id", 'place', to_jsonb(coalesce(b."name", s."name")), 'confirmed', 'ODbL-1.0', p."decided_by", p."decided_at", coalesce(p."decided_at", p."created_at"), p."created_at"
FROM "spot_publication" p
JOIN "spot" s ON s."id" = p."spot_id"
LEFT JOIN "surf_break" b ON b."id" = p."break_id"
WHERE p."status" = 'accepted'
  AND NOT EXISTS (
    SELECT 1 FROM "break_contribution" c
    WHERE c."line" = 'place' AND c."break_ref" = coalesce(p."break_id", p."id")
  );
