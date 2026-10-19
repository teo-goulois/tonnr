CREATE TABLE "report_notice" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"break_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"read_at" timestamp with time zone,
	"told" integer DEFAULT 1 NOT NULL,
	"push_state" text,
	"due_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "report_notice_report" (
	"notice_id" text,
	"report_id" text,
	CONSTRAINT "report_notice_report_pkey" PRIMARY KEY("notice_id","report_id")
);
--> statement-breakpoint
ALTER TABLE "alert_settings" ADD COLUMN "on_reports" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "station_list" ADD COLUMN "reports_on" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "station_list_member" ADD COLUMN "reports_on" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "surf_report" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "surf_report" ADD COLUMN "announced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "surf_report" ADD COLUMN "told" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "surf_report" ADD COLUMN "views" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "surf_report" ADD COLUMN "opens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "report_notice_userId_createdAt_idx" ON "report_notice" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "report_notice_userId_breakId_createdAt_idx" ON "report_notice" ("user_id","break_id","created_at");--> statement-breakpoint
CREATE INDEX "report_notice_pushState_dueAt_idx" ON "report_notice" ("push_state","due_at");--> statement-breakpoint
CREATE INDEX "report_notice_report_reportId_idx" ON "report_notice_report" ("report_id");--> statement-breakpoint
ALTER TABLE "report_notice" ADD CONSTRAINT "report_notice_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "report_notice" ADD CONSTRAINT "report_notice_break_id_surf_break_id_fkey" FOREIGN KEY ("break_id") REFERENCES "surf_break"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "report_notice_report" ADD CONSTRAINT "report_notice_report_notice_id_report_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "report_notice"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "report_notice_report" ADD CONSTRAINT "report_notice_report_report_id_surf_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "surf_report"("id") ON DELETE CASCADE;--> statement-breakpoint
-- What was shown before this version is not told: the first worker of it tells only what is shown from now on, which sets published_at.
UPDATE "surf_report" SET "announced_at" = now() WHERE "state" <> 'checking';
