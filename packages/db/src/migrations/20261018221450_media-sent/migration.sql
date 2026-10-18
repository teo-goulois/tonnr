CREATE TABLE "media_sent_day" (
	"day" date PRIMARY KEY,
	"bytes" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_sent_hour" (
	"user_id" text,
	"hour" timestamp with time zone,
	"files" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "media_sent_hour_pkey" PRIMARY KEY("user_id","hour")
);
--> statement-breakpoint
ALTER TABLE "media_sent_hour" ADD CONSTRAINT "media_sent_hour_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;