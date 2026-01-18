import { Router } from 'express';
import { db } from '../config/db';
import { videos } from '../models';
import { ensureVideoWithIncident } from '../services/incidentGrouper';
import { CREATED, BAD_REQUEST, INTERNAL_SERVER_ERROR, OK } from '../config/http';
import { eq, desc } from 'drizzle-orm';
import { sseManager } from '../services/sse';

const router = Router();

/**
 * POST /videos
 * Register a new video with location and time
 * Auto-assigns to an incident (creates new one if necessary)
 */
router.post('/', async (req, res) => {
  try {
    const { videoId, videoUrl, lat, lng, startedAt } = req.body;

    // Validate required fields
    if (!videoId || !videoUrl || lat === undefined || lng === undefined || !startedAt) {
      res.status(BAD_REQUEST).json({
        error: 'Missing required fields: videoId, videoUrl, lat, lng, startedAt',
      });
      return;
    }

    // Parse startedAt to Date if string
    const startedAtDate = new Date(startedAt);
    if (isNaN(startedAtDate.getTime())) {
      res.status(BAD_REQUEST).json({
        error: 'Invalid startedAt date format',
      });
      return;
    }

    // Ensure video exists and has incident
    const result = await ensureVideoWithIncident(
      videoId,
      videoUrl,
      parseFloat(lat),
      parseFloat(lng),
      startedAtDate
    );

    console.log(`Video registered: ${result.videoId}, incident: ${result.incidentId}, new: ${result.isNewVideo}`);

    // Broadcast new video event if it's a new video
    if (result.isNewVideo) {
      sseManager.broadcast('newVideo', {
        videoId: result.videoId,
        incidentId: result.incidentId,
        videoUrl,
        lat,
        lng,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(CREATED).json({
      videoId: result.videoId,
      incidentId: result.incidentId,
      isNewVideo: result.isNewVideo,
    });
  } catch (error) {
    console.error('Error registering video:', error);
    res.status(INTERNAL_SERVER_ERROR).json({ error: 'Failed to register video' });
  }
});

/**
 * GET /videos
 * List all videos
 */
router.get('/', async (req, res) => {
  try {
    const videosList = await db
      .select()
      .from(videos)
      .orderBy(desc(videos.createdAt));

    res.status(OK).json(videosList);
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch videos' });
  }
});

/**
 * GET /videos/:id
 * Get a specific video
 */
router.get('/:id', async (req, res) => {
  try {
    const [video] = await db
      .select()
      .from(videos)
      .where(eq(videos.id, req.params.id));

    if (!video) {
      res.status(404).json({ error: 'Video not found' });
      return;
    }

    res.status(OK).json(video);
  } catch (error) {
    console.error('Error fetching video:', error);
    res.status(INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch video' });
  }
});

export default router;
