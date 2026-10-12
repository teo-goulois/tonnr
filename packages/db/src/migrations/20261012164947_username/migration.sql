CREATE TABLE "removed_username" (
	"username" text PRIMARY KEY,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_key" UNIQUE("username");