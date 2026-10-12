CREATE TABLE "visitor_closure" (
	"id" text PRIMARY KEY DEFAULT 'instance',
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visitor_closure_one_row" CHECK ("id" = 'instance')
);
