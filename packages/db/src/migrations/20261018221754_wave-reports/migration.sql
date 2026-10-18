CREATE TABLE "surf_report" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"break_id" text NOT NULL,
	"state" text DEFAULT 'checking' NOT NULL,
	"wave_size" text,
	"set_size" text,
	"note" text,
	"device_latitude" double precision,
	"device_longitude" double precision,
	"device_accuracy_m" real,
	"offset_minutes" smallint,
	"forecast" jsonb,
	"terms" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"restored_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "surf_report_flag" (
	"report_id" text,
	"user_id" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surf_report_flag_pkey" PRIMARY KEY("report_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "report_id" text;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "checks" jsonb;--> statement-breakpoint
CREATE INDEX "media_reportId_idx" ON "media" ("report_id");--> statement-breakpoint
CREATE INDEX "surf_report_breakId_createdAt_idx" ON "surf_report" ("break_id","created_at");--> statement-breakpoint
CREATE INDEX "surf_report_userId_createdAt_idx" ON "surf_report" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "surf_report_state_createdAt_idx" ON "surf_report" ("state","created_at");--> statement-breakpoint
CREATE INDEX "surf_report_flag_userId_idx" ON "surf_report_flag" ("user_id");--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_report_id_surf_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "surf_report"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "surf_report" ADD CONSTRAINT "surf_report_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "surf_report" ADD CONSTRAINT "surf_report_break_id_surf_break_id_fkey" FOREIGN KEY ("break_id") REFERENCES "surf_break"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "surf_report_flag" ADD CONSTRAINT "surf_report_flag_report_id_surf_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "surf_report"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "surf_report_flag" ADD CONSTRAINT "surf_report_flag_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_report_purpose" CHECK ("report_id" is null or "purpose" = 'report');