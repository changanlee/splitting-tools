CREATE TABLE "claim_changes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"receipt_line_id" text,
	"identity_id" text,
	"action" text NOT NULL,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"receipt_line_id" text NOT NULL,
	"identity_id" text NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identities" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"name" text NOT NULL,
	"device_token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "claim_changes" ADD CONSTRAINT "claim_changes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_receipt_line_id_receipt_lines_id_fk" FOREIGN KEY ("receipt_line_id") REFERENCES "public"."receipt_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_identity_id_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identities" ADD CONSTRAINT "identities_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_claim_changes_session_created_at" ON "claim_changes" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_claims_line_identity" ON "claims" USING btree ("receipt_line_id","identity_id");--> statement-breakpoint
CREATE INDEX "idx_claims_session" ON "claims" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_claims_identity" ON "claims" USING btree ("identity_id");--> statement-breakpoint
CREATE INDEX "idx_identities_session" ON "identities" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_identities_session_token" ON "identities" USING btree ("session_id","device_token_hash");