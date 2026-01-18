ALTER TABLE "timeline_events" RENAME COLUMN "incident_id" TO "video_id";--> statement-breakpoint
ALTER TABLE "snapshots" DROP CONSTRAINT "snapshots_incident_id_incidents_id_fk";
--> statement-breakpoint
ALTER TABLE "timeline_events" DROP CONSTRAINT "timeline_events_incident_id_incidents_id_fk";
--> statement-breakpoint
ALTER TABLE "incidents" ALTER COLUMN "current_state" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" DROP COLUMN "radius";--> statement-breakpoint
ALTER TABLE "snapshots" DROP COLUMN "incident_id";--> statement-breakpoint
ALTER TABLE "timeline_events" DROP COLUMN "event_type";