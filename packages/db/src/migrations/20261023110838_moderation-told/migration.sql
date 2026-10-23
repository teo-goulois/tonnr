-- When the mail that tells the instance's address what accounts flagged and contested named each
-- one: decision 067. What came before that mail existed is taken as told, so that its first mail
-- names what is new and not the whole history, which the admin's moderation holds.
ALTER TABLE "contribution_verdict" ADD COLUMN "told_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "surf_report_flag" ADD COLUMN "told_at" timestamp with time zone;--> statement-breakpoint
UPDATE "contribution_verdict" SET "told_at" = "created_at" WHERE "verdict" = 'contest';--> statement-breakpoint
UPDATE "surf_report_flag" SET "told_at" = "created_at";--> statement-breakpoint
CREATE INDEX "contribution_verdict_untold_idx" ON "contribution_verdict" ("created_at") WHERE "verdict" = 'contest' and "told_at" is null;--> statement-breakpoint
CREATE INDEX "surf_report_flag_untold_idx" ON "surf_report_flag" ("created_at") WHERE "told_at" is null;
