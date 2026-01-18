import { Router } from 'express';
import { db } from '../config/db';
import { videos, timelineEvents, type VideoStatus } from '../models';
import { updateVideoStatus } from '../services/incidentGrouper';
import { BAD_REQUEST, INTERNAL_SERVER_ERROR, OK, NOT_FOUND } from '../config/http';
import { eq, desc, asc } from 'drizzle-orm';
import { sseManager } from '../services/sse';

const router = Router();

/**
 * PATCH /videos/:id
 * Update video status and/or set the recording URL
 * Call this when:
 * - Stream ends (status: 'ended')
 * - Recording is ready (status: 'recorded', videoUrl: '...')
 */
router.patch('/:id', async (req, res) => {
  try {
    const videoId = req.params.id;
    const { status, videoUrl } = req.body;

    // Check video exists
    const [existingVideo] = await db
      .select()
      .from(videos)
      .where(eq(videos.id, videoId));

    if (!existingVideo) {
      res.status(NOT_FOUND).json({ error: 'Video not found' });
      return;
    }

    // Validate status if provided
    const validStatuses: VideoStatus[] = ['live', 'ended', 'recorded'];
    if (status && !validStatuses.includes(status)) {
      res.status(BAD_REQUEST).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
      return;
    }

    // Update video
    if (status) {
      await updateVideoStatus(videoId, status, videoUrl);
    } else if (videoUrl) {
      // Just updating URL without status change
      await db
        .update(videos)
        .set({ videoUrl, updatedAt: new Date() })
        .where(eq(videos.id, videoId));
    }

    // Get updated video
    const [updatedVideo] = await db
      .select()
      .from(videos)
      .where(eq(videos.id, videoId));

    // Broadcast video status change
    sseManager.broadcast('videoStatusChanged', {
      videoId,
      status: updatedVideo.status,
      videoUrl: updatedVideo.videoUrl,
      timestamp: new Date().toISOString(),
    });

    res.status(OK).json(updatedVideo);
  } catch (error) {
    console.error('Error updating video:', error);
    res.status(INTERNAL_SERVER_ERROR).json({ error: 'Failed to update video' });
  }
});

/**
 * GET /videos
 * List all videos
 */
router.get('/', async (req, res) => {
  try {
    const { status, incidentId, limit = '50' } = req.query;

    let query = db.select().from(videos);

    if (status) {
      query = query.where(eq(videos.status, status as VideoStatus)) as typeof query;
    }

    if (incidentId) {
      query = query.where(eq(videos.incidentId, incidentId as string)) as typeof query;
    }

    const videosList = await query
      .orderBy(desc(videos.createdAt))
      .limit(parseInt(limit as string, 10));

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
      res.status(NOT_FOUND).json({ error: 'Video not found' });
      return;
    }

    res.status(OK).json(video);
  } catch (error) {
    console.error('Error fetching video:', error);
    res.status(INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch video' });
  }
});

/**
 * GET /videos/:id/timeline
 * Get the timeline of AI-derived events for a video
 */
router.get('/:id/timeline', async (req, res) => {
  try {
    const videoId = req.params.id;

    // Verify video exists
    const [video] = await db
      .select({ id: videos.id })
      .from(videos)
      .where(eq(videos.id, videoId));

    if (!video) {
      res.status(NOT_FOUND).json({ error: 'Video not found' });
      return;
    }

    // Get timeline events for this video
    const timeline = await db
      .select()
      .from(timelineEvents)
      .where(eq(timelineEvents.videoId, videoId))
      .orderBy(asc(timelineEvents.timestamp));

    res.status(OK).json(timeline);
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch timeline' });
  }
});

export default router;
