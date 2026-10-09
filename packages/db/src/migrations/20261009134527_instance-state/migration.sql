CREATE TABLE "job" (
	"name" text PRIMARY KEY,
	"schedule" text NOT NULL,
	"every_seconds" integer NOT NULL,
	"expires_seconds" integer NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempt_id" text,
	"worker_id" text,
	"started_at" timestamp with time zone,
	"deadline_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"outcome" text,
	"counts" jsonb,
	"failure" jsonb,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_failure" jsonb,
	"failures_in_a_row" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_process" (
	"id" text PRIMARY KEY,
	"started_at" timestamp with time zone NOT NULL,
	"ready_at" timestamp with time zone,
	"seen_at" timestamp with time zone NOT NULL
);
