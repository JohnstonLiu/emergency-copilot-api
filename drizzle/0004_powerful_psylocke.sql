ALTER TABLE "videos" ADD COLUMN "current_state" text;--> statement-breakpoint
ALTER TABLE "incidents" DROP COLUMN "current_state";