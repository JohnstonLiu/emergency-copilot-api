import { db } from '../config/db';
import { incidents, videos, type Incident, type InsertIncident, type VideoStatus } from '../models';
import { isWithinRadius } from '../utils/geo';
import { INCIDENT_TIME_WINDOW_HOURS, INCIDENT_RADIUS_METERS } from '../config/env';
import { eq, and, gte } from 'drizzle-orm';

/**
 * Service responsible for grouping videos into incidents based on
 * location proximity and time window
 */

interface VideoLocation {
  lat: number;
  lng: number;
  startedAt: Date;
}

/**
 * Find an existing incident that matches the location and time criteria
 * @param location Video location and start time
 * @returns Matching incident or null
 */
async function findMatchingIncident(location: VideoLocation): Promise<Incident | null> {
  // Calculate time window boundary
  const timeWindowStart = new Date(
    location.startedAt.getTime() - INCIDENT_TIME_WINDOW_HOURS * 60 * 60 * 1000
  );

  // Get all active incidents within the time window
  const activeIncidents = await db
    .select()
    .from(incidents)
    .where(
      and(
        eq(incidents.status, 'active'),
        gte(incidents.startedAt, timeWindowStart)
      )
    );

  // Filter by location proximity
  for (const incident of activeIncidents) {
    if (
      isWithinRadius(
        location.lat,
        location.lng,
        incident.lat,
        incident.lng,
        incident.radius ?? INCIDENT_RADIUS_METERS
      )
    ) {
      return incident;
    }
  }

  return null;
}

/**
 * Create a new incident at the given location
 * @param location Video location and start time
 * @returns Newly created incident
 */
async function createIncident(location: VideoLocation): Promise<Incident> {
  const newIncident: InsertIncident = {
    lat: location.lat,
    lng: location.lng,
    radius: INCIDENT_RADIUS_METERS,
    status: 'active',
    startedAt: location.startedAt,
    currentState: null,
  };

  const [created] = await db.insert(incidents).values(newIncident).returning();
  console.log(`Created new incident: ${created.id} at (${location.lat}, ${location.lng})`);
  return created;
}

/**
 * Assign a video to an incident, creating a new incident if necessary
 * @param videoId Video ID to assign
 * @param lat Latitude of video location
 * @param lng Longitude of video location
 * @param startedAt When the video started
 * @returns The incident ID the video was assigned to
 */
export async function assignVideoToIncident(
  videoId: string,
  lat: number,
  lng: number,
  startedAt: Date
): Promise<string> {
  const location: VideoLocation = { lat, lng, startedAt };

  // Try to find an existing matching incident
  let incident = await findMatchingIncident(location);

  // Create a new incident if no match found
  if (!incident) {
    incident = await createIncident(location);
  } else {
    console.log(`Video ${videoId} assigned to existing incident: ${incident.id}`);
  }

  // Update the video with the incident ID
  await db
    .update(videos)
    .set({ incidentId: incident.id })
    .where(eq(videos.id, videoId));

  return incident.id;
}

/**
 * Get the incident ID for a video, or null if not assigned
 * @param videoId Video ID to look up
 * @returns Incident ID or null
 */
export async function getIncidentForVideo(videoId: string): Promise<string | null> {
  const [video] = await db
    .select({ incidentId: videos.incidentId })
    .from(videos)
    .where(eq(videos.id, videoId));

  return video?.incidentId ?? null;
}

/**
 * Ensure a video exists and has an incident assigned
 * Creates the video record if it doesn't exist (auto-created from first snapshot)
 * @param videoId Video ID (required - provided by the Next.js client)
 * @param lat Latitude
 * @param lng Longitude
 * @param startedAt Start time
 * @returns Video ID, Incident ID, and whether this is a new video
 */
export async function ensureVideoWithIncident(
  videoId: string,
  lat: number,
  lng: number,
  startedAt: Date
): Promise<{ videoId: string; incidentId: string; isNewVideo: boolean }> {
  // Check if video already exists
  const [existingVideo] = await db
    .select()
    .from(videos)
    .where(eq(videos.id, videoId));

  if (existingVideo) {
    // Video exists, check if it has an incident
    if (existingVideo.incidentId) {
      return {
        videoId: existingVideo.id,
        incidentId: existingVideo.incidentId,
        isNewVideo: false,
      };
    }

    // Video exists but no incident - assign one
    const incidentId = await assignVideoToIncident(
      existingVideo.id,
      existingVideo.lat,
      existingVideo.lng,
      existingVideo.startedAt
    );

    return {
      videoId: existingVideo.id,
      incidentId,
      isNewVideo: false,
    };
  }

  // Video doesn't exist - create it (status defaults to 'live', no videoUrl yet)
  const [newVideo] = await db
    .insert(videos)
    .values({
      id: videoId,
      status: 'live',
      lat,
      lng,
      startedAt,
    })
    .returning();

  // Assign to incident
  const incidentId = await assignVideoToIncident(newVideo.id, lat, lng, startedAt);

  return {
    videoId: newVideo.id,
    incidentId,
    isNewVideo: true,
  };
}

/**
 * Update a video's status and optionally set the recording URL
 * @param videoId Video ID
 * @param status New status
 * @param videoUrl Optional video URL (for recorded videos)
 */
export async function updateVideoStatus(
  videoId: string,
  status: VideoStatus,
  videoUrl?: string
): Promise<void> {
  const updateData: { status: VideoStatus; videoUrl?: string; endedAt?: Date; updatedAt: Date } = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'ended' || status === 'recorded') {
    updateData.endedAt = new Date();
  }

  if (videoUrl) {
    updateData.videoUrl = videoUrl;
  }

  await db
    .update(videos)
    .set(updateData)
    .where(eq(videos.id, videoId));

  console.log(`Video ${videoId} status updated to ${status}${videoUrl ? ` with URL: ${videoUrl}` : ''}`);
}
