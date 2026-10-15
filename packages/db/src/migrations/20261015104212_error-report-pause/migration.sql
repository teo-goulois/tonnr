CREATE TABLE "error_report_pause" (
	"id" text PRIMARY KEY DEFAULT 'instance',
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "error_report_pause_one_row" CHECK ("id" = 'instance')
);
