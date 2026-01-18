import { Router } from 'express';
import { db } from '../config/db';
import { snapshots, videos } from '../models';
import { snapshotBuffer } from '../services/snapshotBuffer';
import { sseManager } from '../services/sse';
import { ensureVideoWithIncident } from '../services/incidentGrouper';
import { CREATED, BAD_REQUEST, INTERNAL_SERVER_ERROR, OK, NOT_FOUND } from '../config/http';
import { eq, desc, and } from 'drizzle-orm';

const router = Router();

/**
 * POST /snapshots
 * Receive a snapshot from the Next.js client
 * Auto-creates video and incident if needed, buffers for batch processing
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

    // Parse timestamp
    const snapshotTimestamp = timestamp ? new Date(timestamp) : new Date();
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    // Auto-create video and incident if needed (first snapshot creates the video)
    const { incidentId, isNewVideo } = await ensureVideoWithIncident(
      videoId,
      parsedLat,
      parsedLng,
      snapshotTimestamp
    );

    if (isNewVideo) {
      console.log(`Auto-created video ${videoId} and assigned to incident ${incidentId}`);
      
      // Broadcast new video event
      sseManager.broadcast('newVideo', {
        videoId,
        incidentId,
        lat: parsedLat,
        lng: parsedLng,
        status: 'live',
        timestamp: new Date().toISOString(),
      });
    }

    // Insert the snapshot
    const [newSnapshot] = await db.insert(snapshots).values({
      videoId,
      timestamp: snapshotTimestamp,
      lat: parsedLat,
      lng: parsedLng,
      type,
      scenario,
      data: data || {},
    }).returning();

    console.log(`Snapshot received for incident ${incidentId}: ${newSnapshot.id}`);

    // Add to buffer for batch processing
    snapshotBuffer.add(incidentId, newSnapshot);

    // Broadcast snapshot received event
    sseManager.broadcast('snapshotReceived', {
      videoId,
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
      incidentId,
      videoId: newSnapshot.videoId,
      isNewVideo,
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

    // If filtering by incidentId, we need to join through videos
    if (incidentId) {
      const snapshotsList = await db
        .select({
          id: snapshots.id,
          videoId: snapshots.videoId,
          timestamp: snapshots.timestamp,
          lat: snapshots.lat,
          lng: snapshots.lng,
          type: snapshots.type,
          scenario: snapshots.scenario,
          data: snapshots.data,
          createdAt: snapshots.createdAt,
          updatedAt: snapshots.updatedAt,
        })
        .from(snapshots)
        .innerJoin(videos, eq(snapshots.videoId, videos.id))
        .where(
          videoId
            ? and(eq(videos.incidentId, incidentId as string), eq(snapshots.videoId, videoId as string))
            : eq(videos.incidentId, incidentId as string)
        )
        .orderBy(desc(snapshots.timestamp))
        .limit(parseInt(limit as string, 10));

      res.status(OK).json(snapshotsList);
      return;
    }

    // Simple query without incident filter
    let query = db.select().from(snapshots);

    if (videoId) {
      query = query.where(eq(snapshots.videoId, videoId as string)) as typeof query;
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
