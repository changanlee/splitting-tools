CREATE TABLE "access_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
