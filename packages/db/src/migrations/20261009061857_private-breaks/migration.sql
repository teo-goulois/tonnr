CREATE TABLE "private_break" (
	"id" text PRIMARY KEY,
	"provider" text NOT NULL,
	"provider_ref" text NOT NULL,
	"name" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"source_url" text NOT NULL,
	"rights" text DEFAULT 'not-established' NOT NULL,
	"terms_url" text NOT NULL,
	"details" jsonb NOT NULL,
	"collected_at" timestamp with time zone NOT NULL,
	"import_id" text NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "private_break_import" (
	"id" text PRIMARY KEY,
	"provider" text NOT NULL,
	"file_sha256" text NOT NULL,
	"listed" integer NOT NULL,
	"added" integer NOT NULL,
	"changed" integer NOT NULL,
	"unchanged" integer NOT NULL,
	"absent" integer NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "private_break_provider_ref_idx" ON "private_break" ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX "private_break_importId_idx" ON "private_break" ("import_id");--> statement-breakpoint
ALTER TABLE "private_break" ADD CONSTRAINT "private_break_import_id_private_break_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "private_break_import"("id");