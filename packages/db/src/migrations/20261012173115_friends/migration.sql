CREATE TABLE "account_link" (
	"user_id" text PRIMARY KEY,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friendship" (
	"user_id" text,
	"friend_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_by" text,
	"ended_at" timestamp with time zone,
	CONSTRAINT "friendship_pkey" PRIMARY KEY("user_id","friend_id"),
	CONSTRAINT "friendship_order" CHECK ("user_id" collate "C" < "friend_id" collate "C")
);
--> statement-breakpoint
CREATE TABLE "sponsorship" (
	"sponsored_id" text PRIMARY KEY,
	"sponsor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "friendship_friendId_idx" ON "friendship" ("friend_id");--> statement-breakpoint
CREATE INDEX "sponsorship_sponsorId_idx" ON "sponsorship" ("sponsor_id");--> statement-breakpoint
ALTER TABLE "account_link" ADD CONSTRAINT "account_link_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "friendship" ADD CONSTRAINT "friendship_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "friendship" ADD CONSTRAINT "friendship_friend_id_user_id_fkey" FOREIGN KEY ("friend_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sponsorship" ADD CONSTRAINT "sponsorship_sponsored_id_user_id_fkey" FOREIGN KEY ("sponsored_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "sponsorship" ADD CONSTRAINT "sponsorship_sponsor_id_user_id_fkey" FOREIGN KEY ("sponsor_id") REFERENCES "user"("id") ON DELETE SET NULL;