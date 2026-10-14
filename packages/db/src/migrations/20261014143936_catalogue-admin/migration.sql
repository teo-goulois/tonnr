CREATE TABLE "surf_break_listing" (
	"list" text,
	"ref" text,
	"break_id" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surf_break_listing_pkey" PRIMARY KEY("list","ref")
);
--> statement-breakpoint
CREATE TABLE "break_candidate" (
	"id" text PRIMARY KEY,
	"list" text NOT NULL,
	"ref" text NOT NULL,
	"name" text NOT NULL,
	"location" text[],
	"latitude" double precision,
	"longitude" double precision,
	"point_note" text,
	"point_url" text,
	"characteristics" jsonb,
	"proposal" jsonb,
	"evidence" jsonb DEFAULT '[]' NOT NULL,
	"texts" jsonb DEFAULT '[]' NOT NULL,
	"figures" jsonb DEFAULT '[]' NOT NULL,
	"details" jsonb,
	"status" text DEFAULT 'waiting' NOT NULL,
	"note" text,
	"break_id" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "break_candidate_image" (
	"list" text,
	"name" text,
	"content_type" text NOT NULL,
	"bytes" bytea NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "break_candidate_image_pkey" PRIMARY KEY("list","name")
);
--> statement-breakpoint
ALTER TABLE "surf_break" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "surf_break" ADD COLUMN "description_language" text;--> statement-breakpoint
ALTER TABLE "surf_break" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "surf_break_listing_breakId_idx" ON "surf_break_listing" ("break_id");--> statement-breakpoint
CREATE UNIQUE INDEX "break_candidate_list_ref_idx" ON "break_candidate" ("list","ref");--> statement-breakpoint
CREATE INDEX "break_candidate_status_idx" ON "break_candidate" ("status","list");--> statement-breakpoint
CREATE INDEX "break_candidate_breakId_idx" ON "break_candidate" ("break_id");--> statement-breakpoint
ALTER TABLE "surf_break_listing" ADD CONSTRAINT "surf_break_listing_break_id_surf_break_id_fkey" FOREIGN KEY ("break_id") REFERENCES "surf_break"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "break_candidate" ADD CONSTRAINT "break_candidate_break_id_surf_break_id_fkey" FOREIGN KEY ("break_id") REFERENCES "surf_break"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "break_candidate" ADD CONSTRAINT "break_candidate_decided_by_user_id_fkey" FOREIGN KEY ("decided_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
-- Each break that names its list and its reference gets the row of that list, with what the
-- list said of it besides, which `surf_break_record` held until now. That table stays one
-- release: the version before this one writes it while this one is deployed (decision 009).
INSERT INTO "surf_break_listing" ("list", "ref", "break_id", "details", "created_at")
SELECT b."provider", b."provider_ref", b."id", r."details", b."created_at"
FROM "surf_break" b
LEFT JOIN "surf_break_record" r ON r."break_id" = b."id"
WHERE b."provider" IS NOT NULL AND b."provider_ref" IS NOT NULL
ON CONFLICT DO NOTHING;
