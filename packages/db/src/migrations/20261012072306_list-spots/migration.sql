CREATE TABLE "station_list_spot" (
	"list_id" text,
	"spot_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "station_list_spot_pkey" PRIMARY KEY("list_id","spot_id")
);
--> statement-breakpoint
CREATE INDEX "station_list_spot_spotId_idx" ON "station_list_spot" ("spot_id");--> statement-breakpoint
ALTER TABLE "station_list_spot" ADD CONSTRAINT "station_list_spot_list_id_station_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "station_list"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "station_list_spot" ADD CONSTRAINT "station_list_spot_spot_id_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "spot"("id") ON DELETE CASCADE;