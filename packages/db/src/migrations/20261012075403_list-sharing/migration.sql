CREATE TABLE "station_list_member" (
	"list_id" text,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "station_list_member_pkey" PRIMARY KEY("list_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "station_list_share" (
	"list_id" text PRIMARY KEY,
	"token" text NOT NULL UNIQUE,
	"password_hash" text,
	"wrong_passwords" integer DEFAULT 0 NOT NULL,
	"wrong_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "station_list_member_userId_idx" ON "station_list_member" ("user_id");--> statement-breakpoint
ALTER TABLE "station_list_member" ADD CONSTRAINT "station_list_member_list_id_station_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "station_list"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "station_list_member" ADD CONSTRAINT "station_list_member_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "station_list_share" ADD CONSTRAINT "station_list_share_list_id_station_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "station_list"("id") ON DELETE CASCADE;