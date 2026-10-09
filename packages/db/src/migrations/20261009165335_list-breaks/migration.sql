CREATE TABLE "station_list_break" (
	"list_id" text,
	"break_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "station_list_break_pkey" PRIMARY KEY("list_id","break_id")
);
--> statement-breakpoint
CREATE INDEX "station_list_break_breakId_idx" ON "station_list_break" ("break_id");--> statement-breakpoint
ALTER TABLE "station_list_break" ADD CONSTRAINT "station_list_break_list_id_station_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "station_list"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "station_list_break" ADD CONSTRAINT "station_list_break_break_id_surf_break_id_fkey" FOREIGN KEY ("break_id") REFERENCES "surf_break"("id") ON DELETE CASCADE;