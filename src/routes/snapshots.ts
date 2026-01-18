import { Router } from 'express';
import { db } from '../config/db';
import { snapshots, videos } from '../models';
import { snapshotBuffer } from '../services/snapshotBuffer';
import { sseManager } from '../services/sse';
import { CREATED, BAD_REQUEST, INTERNAL_SERVER_ERROR, OK, NOT_FOUND } from '../config/http';
import { eq, desc } from 'drizzle-orm';

const router = Router();

/**
 * POST /snapshots
 * Receive a snapshot from the Next.js client
 * Auto-assigns to incident via video, buffers for batch processing
 */
router.post('/', async (req, res) => {
  try {
    const {
      videoId,
      timestamp,
      lat,
      lng,
      type,
      scenario,
      data,
    } = req.body;

    // Validate required fields
    if (!videoId || lat === undefined || lng === undefined || !type || !scenario) {
      res.status(BAD_REQUEST).json({
        error: 'Missing required fields: videoId, lat, lng, type, scenario',
      });
      return;
    }

    // Get the video to find its incident
    const [video] = await db
      .select()
      .from(videos)
      .where(eq(videos.id, videoId));

    if (!video) {
      res.status(NOT_FOUND).json({
        error: `Video not found: ${videoId}. Please register the video first via POST /videos`,
      });
      return;
    }

    if (!video.incidentId) {
      res.status(BAD_REQUEST).json({
        error: `Video ${videoId} is not associated with an incident`,
      });
      return;
    }

    // Parse timestamp
    const snapshotTimestamp = timestamp ? new Date(timestamp) : new Date();

    // Insert the snapshot
    const [newSnapshot] = await db.insert(snapshots).values({
      videoId,
      incidentId: video.incidentId,
      timestamp: snapshotTimestamp,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      type,
      scenario,
      data: data || {},
    }).returning();

    console.log(`Snapshot received for incident ${video.incidentId}: ${newSnapshot.id}`);

    // Add to buffer for batch processing
    snapshotBuffer.add(video.incidentId, newSnapshot);

    // Broadcast snapshot received event to incident subscribers
    sseManager.broadcastToIncident(video.incidentId, 'snapshotReceived', {
      incidentId: video.incidentId,
      snapshot: {
        id: newSnapshot.id,
        timestamp: newSnapshot.timestamp,
        type: newSnapshot.type,
        scenario: newSnapshot.scenario,
      },
      timestamp: new Date().toISOString(),
    });

    res.status(CREATED).json({
      snapshotId: newSnapshot.id,
      incidentId: video.incidentId,
      videoId: newSnapshot.videoId,
    });
  } catch (error) {
    console.error('Error creating snapshot:', error);
    res.status(INTERNAL_SERVER_ERROR).json({ error: 'Failed to create snapshot' });
  }
});

/**
 * GET /snapshots
 * List all snapshots (with optional filters)
 */
router.get('/', async (req, res) => {
  try {
    const { videoId, incidentId, limit = '50' } = req.query;

    let query = db.select().from(snapshots);

    if (videoId) {
      query = query.where(eq(snapshots.videoId, videoId as string)) as typeof query;
    }

    if (incidentId) {
      query = query.where(eq(snapshots.incidentId, incidentId as string)) as typeof query;
    }

    const snapshotsList = await query
      .orderBy(desc(snapshots.timestamp))
      .limit(parseInt(limit as string, 10));

    res.status(OK).json(snapshotsList);
  } catch (error) {
    console.error('Error fetching snapshots:', error);
    res.status(INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch snapshots' });
  }
});

/**
 * GET /snapshots/:id
 * Get a specific snapshot
 */
router.get('/:id', async (req, res) => {
  try {
    const [snapshot] = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.id, req.params.id));

    if (!snapshot) {
      res.status(NOT_FOUND).json({ error: 'Snapshot not found' });
      return;
    }

    res.status(OK).json(snapshot);
  } catch (error) {
    console.error('Error fetching snapshot:', error);
    res.status(INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch snapshot' });
  }
});

export default router;
