ALTER TABLE "identities" ALTER COLUMN "device_token_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "creator_token_hash" text;