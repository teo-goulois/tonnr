CREATE TABLE "break_answer" (
	"break_id" text,
	"user_id" text,
	"question" text,
	"answer" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "break_answer_pkey" PRIMARY KEY("break_id","user_id","question")
);
--> statement-breakpoint
CREATE TABLE "break_contribution" (
	"id" text PRIMARY KEY,
	"break_id" text,
	"user_id" text,
	"line" text NOT NULL,
	"value" jsonb NOT NULL,
	"language" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"license" text NOT NULL,
	"reason" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"shown_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contribution_verdict" (
	"contribution_id" text,
	"user_id" text,
	"verdict" text NOT NULL,
	"reason" text,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contribution_verdict_pkey" PRIMARY KEY("contribution_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "rank_award" (
	"user_id" text,
	"rank" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rank_award_pkey" PRIMARY KEY("user_id","rank")
);
--> statement-breakpoint
CREATE INDEX "break_answer_userId_idx" ON "break_answer" ("user_id");--> statement-breakpoint
CREATE INDEX "break_contribution_guide_idx" ON "break_contribution" ("break_id","line","confirmed_at") WHERE "status" = 'confirmed';--> statement-breakpoint
CREATE INDEX "break_contribution_shown_idx" ON "break_contribution" ("break_id","shown_at") WHERE "status" = 'shown';--> statement-breakpoint
CREATE INDEX "break_contribution_userId_createdAt_idx" ON "break_contribution" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "break_contribution_status_createdAt_idx" ON "break_contribution" ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "break_contribution_waiting_idx" ON "break_contribution" ("user_id","break_id","line") WHERE "status" in ('pending', 'shown');--> statement-breakpoint
CREATE INDEX "contribution_verdict_userId_createdAt_idx" ON "contribution_verdict" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "contribution_verdict_waiting_idx" ON "contribution_verdict" ("created_at") WHERE "verdict" = 'contest' and "dismissed_at" is null;--> statement-breakpoint
ALTER TABLE "break_answer" ADD CONSTRAINT "break_answer_break_id_surf_break_id_fkey" FOREIGN KEY ("break_id") REFERENCES "surf_break"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "break_answer" ADD CONSTRAINT "break_answer_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "break_contribution" ADD CONSTRAINT "break_contribution_break_id_surf_break_id_fkey" FOREIGN KEY ("break_id") REFERENCES "surf_break"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "break_contribution" ADD CONSTRAINT "break_contribution_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "break_contribution" ADD CONSTRAINT "break_contribution_decided_by_user_id_fkey" FOREIGN KEY ("decided_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "contribution_verdict" ADD CONSTRAINT "contribution_verdict_contribution_id_break_contribution_id_fkey" FOREIGN KEY ("contribution_id") REFERENCES "break_contribution"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "contribution_verdict" ADD CONSTRAINT "contribution_verdict_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "rank_award" ADD CONSTRAINT "rank_award_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
-- A spot that an operator accepted into the catalogue before this is a contribution of whoever
-- asked, as one accepted from now on is: decision 041.
INSERT INTO "break_contribution" ("id", "break_id", "user_id", "line", "value", "status", "license", "decided_by", "decided_at", "confirmed_at", "created_at")
SELECT gen_random_uuid()::text, p."break_id", p."user_id", 'place', to_jsonb(b."name"), 'confirmed', 'ODbL-1.0', p."decided_by", p."decided_at", coalesce(p."decided_at", p."created_at"), p."created_at"
FROM "spot_publication" p
JOIN "surf_break" b ON b."id" = p."break_id"
WHERE p."status" = 'accepted';
