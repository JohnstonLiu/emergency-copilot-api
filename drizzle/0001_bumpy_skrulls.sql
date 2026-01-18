ALTER TABLE "videos" ALTER COLUMN "video_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "status" varchar(50) DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "ended_at" timestamp;