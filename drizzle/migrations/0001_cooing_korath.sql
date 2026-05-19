CREATE TABLE "receipt_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"parse_job_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"description" text NOT NULL,
	"raw_text" text,
	"qty" integer NOT NULL,
	"gross_cents" integer NOT NULL,
	"net_cents" integer NOT NULL,
	"is_irc" boolean DEFAULT false NOT NULL,
	"claimable" boolean DEFAULT true NOT NULL,
	"irc_attributed_to" text,
	"orphan" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_parse_job_id_parse_jobs_id_fk" FOREIGN KEY ("parse_job_id") REFERENCES "public"."parse_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_receipt_lines_job_line_no" ON "receipt_lines" USING btree ("parse_job_id","line_no");--> statement-breakpoint
CREATE INDEX "idx_receipt_lines_session" ON "receipt_lines" USING btree ("session_id");