CREATE TABLE "station_list" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_list_item" (
	"list_id" text,
	"station_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "station_list_item_pkey" PRIMARY KEY("list_id","station_id")
);
--> statement-breakpoint
CREATE INDEX "station_list_userId_idx" ON "station_list" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "station_list_default_idx" ON "station_list" ("user_id") WHERE "is_default";--> statement-breakpoint
CREATE INDEX "station_list_item_stationId_idx" ON "station_list_item" ("station_id");--> statement-breakpoint
ALTER TABLE "station_list" ADD CONSTRAINT "station_list_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "station_list_item" ADD CONSTRAINT "station_list_item_list_id_station_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "station_list"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "station_list_item" ADD CONSTRAINT "station_list_item_station_id_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "station"("id") ON DELETE CASCADE;