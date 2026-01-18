ALTER TABLE "snapshots" DROP CONSTRAINT IF EXISTS "snapshots_incident_id_incidents_id_fk";
--> statement-breakpoint
ALTER TABLE "snapshots" DROP COLUMN IF EXISTS "incident_id";
