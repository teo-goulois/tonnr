CREATE TABLE "forecast_cell" (
	"lat_step" integer,
	"lon_step" integer,
	"fetched_at" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "forecast_cell_pkey" PRIMARY KEY("lat_step","lon_step")
);
--> statement-breakpoint
CREATE TABLE "provider_calls" (
	"provider" text,
	"bucket" text,
	"start" timestamp with time zone,
	"calls" integer NOT NULL,
	CONSTRAINT "provider_calls_pkey" PRIMARY KEY("provider","bucket","start")
);
--> statement-breakpoint
CREATE INDEX "forecast_cell_fetchedAt_idx" ON "forecast_cell" ("fetched_at");