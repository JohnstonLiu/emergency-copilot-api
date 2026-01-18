import { Router } from 'express';
import { db } from '../config/db';
import { incidents, snapshots, timelineEvents, videos, type IncidentStatus } from '../models';
import { sseManager } from '../services/sse';
import { OK, NOT_FOUND, INTERNAL_SERVER_ERROR } from '../config/http';
import { eq, desc, asc, inArray } from 'drizzle-orm';

const router = Router();

/**
 * GET /incidents
 * List all incidents
 */
router.get('/', async (req, res) => {
  try {
    const { status, limit = '50' } = req.query;

    let query = db.select().from(incidents);

    if (status) {
      query = query.where(eq(incidents.status, status as IncidentStatus)) as typeof query;
    }

    const incidentsList = await query
      .orderBy(desc(incidents.startedAt))
      .limit(parseInt(limit as string, 10));

    res.status(OK).json(incidentsList);
  } catch (error) {
    console.error('Error fetching incidents:', error);
    res.status(INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch incidents' });
  }
});

/**
 * GET /incidents/:id
 * Get a specific incident with its current state and metadata
 */
router.get('/:id', async (req, res) => {
  try {
    const incidentId = req.params.id;

    // Get the incident
    const [incident] = await db
      .select()
      .from(incidents)
      .where(eq(incidents.id, incidentId));

    if (!incident) {
      res.status(NOT_FOUND).json({ error: 'Incident not found' });
      return;
    }

    // Get associated videos
    const incidentVideos = await db
      .select()
      .from(videos)
      .where(eq(videos.incidentId, incidentId));

    // Get snapshot count
    const snapshotCount = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.incidentId, incidentId));

    // Get timeline event count (through videos)
    const videoIds = incidentVideos.map(v => v.id);
    let timelineEventCount = 0;
    if (videoIds.length > 0) {
      const eventCount = await db
        .select()
        .from(timelineEvents)
        .where(inArray(timelineEvents.videoId, videoIds));
      timelineEventCount = eventCount.length;
    }

    res.status(OK).json({
      ...incident,
      videos: incidentVideos,
      snapshotCount: snapshotCount.length,
      timelineEventCount,
    });
  } catch (error) {
    console.error('Error fetching incident:', error);
    res.status(INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch incident' });
  }
});

/**
 * GET /incidents/:id/timeline
 * Get the full timeline of AI-derived events for an incident
 */
router.get('/:id/timeline', async (req, res) => {
  try {
    const incidentId = req.params.id;

    // Verify incident exists and get its videos
    const [incident] = await db
      .select({ id: incidents.id })
      .from(incidents)
      .where(eq(incidents.id, incidentId));

    if (!incident) {
      res.status(NOT_FOUND).json({ error: 'Incident not found' });
      return;
    }

    // Get videos for this incident
    const incidentVideos = await db
      .select({ id: videos.id })
      .from(videos)
      .where(eq(videos.incidentId, incidentId));

    const videoIds = incidentVideos.map(v => v.id);

    // Get timeline events for all videos in this incident
    let timeline: unknown[] = [];
    if (videoIds.length > 0) {
      timeline = await db
        .select()
        .from(timelineEvents)
        .where(inArray(timelineEvents.videoId, videoIds))
        .orderBy(asc(timelineEvents.timestamp));
    }

    res.status(OK).json(timeline);
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch timeline' });
  }
});

/**
 * GET /incidents/:id/snapshots
 * Get raw snapshots for an incident (for debugging/detailed view)
 */
router.get('/:id/snapshots', async (req, res) => {
  try {
    const incidentId = req.params.id;
    const { limit = '100' } = req.query;

    // Verify incident exists
    const [incident] = await db
      .select({ id: incidents.id })
      .from(incidents)
      .where(eq(incidents.id, incidentId));

    if (!incident) {
      res.status(NOT_FOUND).json({ error: 'Incident not found' });
      return;
    }

    // Get snapshots in chronological order
    const snapshotsList = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.incidentId, incidentId))
      .orderBy(asc(snapshots.timestamp))
      .limit(parseInt(limit as string, 10));

    res.status(OK).json(snapshotsList);
  } catch (error) {
    console.error('Error fetching snapshots:', error);
    res.status(INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch snapshots' });
  }
});

/**
 * GET /incidents/:id/stream
 * SSE endpoint for real-time updates on a specific incident
 * Sends current state on connect (late-join support)
 */
router.get('/:id/stream', async (req, res) => {
  try {
    const incidentId = req.params.id;

    // Verify incident exists
    const [incident] = await db
      .select({ id: incidents.id })
      .from(incidents)
      .where(eq(incidents.id, incidentId));

    if (!incident) {
      res.status(NOT_FOUND).json({ error: 'Incident not found' });
      return;
    }

    // Generate client ID
    const clientId = (req.query.clientId as string) ||
      `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`New SSE connection for incident ${incidentId}: ${clientId}`);

    // Subscribe to incident updates
    await sseManager.subscribeToIncident(clientId, incidentId, res);
  } catch (error) {
    console.error('Error setting up SSE stream:', error);
    res.status(INTERNAL_SERVER_ERROR).json({ error: 'Failed to setup stream' });
  }
});

/**
 * Helper function to fetch current state for an incident
 * Used by SSE manager for late-join support
 */
export async function fetchIncidentCurrentState(incidentId: string): Promise<{
  incident: unknown;
  timeline: unknown[];
} | null> {
  const [incident] = await db
    .select()
    .from(incidents)
    .where(eq(incidents.id, incidentId));

  if (!incident) {
    return null;
  }

  const incidentVideos = await db
    .select()
    .from(videos)
    .where(eq(videos.incidentId, incidentId));

  const videoIds = incidentVideos.map(v => v.id);

  let timeline: unknown[] = [];
  if (videoIds.length > 0) {
    timeline = await db
      .select()
      .from(timelineEvents)
      .where(inArray(timelineEvents.videoId, videoIds))
      .orderBy(asc(timelineEvents.timestamp));
  }

  return {
    incident: {
      ...incident,
      videos: incidentVideos,
    },
    timeline,
  };
}

export default router;
