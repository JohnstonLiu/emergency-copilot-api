import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { db } from '../config/db';
import { snapshots } from '../models';
import { snapshotBuffer } from './snapshotBuffer';
import { sseManager } from './sse';
import { ensureVideoWithIncident, updateVideoStatus } from './incidentGrouper';

/**
 * Active video session tracked by WebSocket connection
 */
interface VideoSession {
  videoId: string;
  incidentId: string;
  lat: number;
  lng: number;
  filename?: string; // Original filename for replay (e.g., 'pov1.mov')
  ws: WebSocket;
}

/**
 * Message types from client
 */
interface InitMessage {
  type: 'init';
  videoId: string;
  lat: number;
  lng: number;
  filename?: string; // Original filename for replay (e.g., 'pov1.mov')
}

interface SnapshotMessage {
  type: 'snapshot';
  timestamp?: string;
  scenario: string;
  data: Record<string, unknown>;
}

interface VideoEndedMessage {
  type: 'videoEnded';
  timestamp?: string;
}

type ClientMessage = InitMessage | SnapshotMessage | VideoEndedMessage;

/**
 * WebSocket manager for snapshot ingestion
 */
class SnapshotWebSocketManager {
  private wss: WebSocketServer | null = null;
  private sessions: Map<WebSocket, VideoSession> = new Map();

  /**
   * Initialize WebSocket server attached to HTTP server
   */
  initialize(server: Server): void {
    this.wss = new WebSocketServer({ server, path: '/ws/snapshots' });

    this.wss.on('connection', (ws, req) => {
      const clientIp = req.socket.remoteAddress || 'unknown';
      console.log(`[WS] New connection from ${clientIp}. Active connections: ${this.wss!.clients.size}`);

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString()) as ClientMessage;
          console.log(`[WS] Received message type: ${message.type}`);
          await this.handleMessage(ws, message);
        } catch (error) {
          console.error('[WS] Message parse error:', error);
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
        }
      });

      ws.on('close', async (code, reason) => {
        console.log(`[WS] Connection closed. Code: ${code}, Reason: ${reason.toString() || 'none'}`);
        await this.handleDisconnect(ws);
      });

      ws.on('error', (error) => {
        console.error('[WS] Socket error:', error);
      });

      // Send welcome message
      ws.send(JSON.stringify({ type: 'connected', message: 'Send init message with videoId, lat, lng' }));
    });

    console.log('[WS] WebSocket server initialized at /ws/snapshots');
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(ws: WebSocket, message: ClientMessage): Promise<void> {
    if (message.type === 'init') {
      await this.handleInit(ws, message);
    } else if (message.type === 'snapshot') {
      await this.handleSnapshot(ws, message);
    } else if (message.type === 'videoEnded') {
      await this.handleVideoEnded(ws, message);
    } else {
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
  }

  /**
   * Handle init message - create video and incident
   */
  private async handleInit(ws: WebSocket, message: InitMessage): Promise<void> {
    const { videoId, lat, lng, filename } = message;

    if (!videoId || lat === undefined || lng === undefined) {
      ws.send(JSON.stringify({ type: 'error', message: 'Missing required fields: videoId, lat, lng' }));
      return;
    }

    // Check if this connection already has a session
    if (this.sessions.has(ws)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Session already initialized' }));
      return;
    }

    const parsedLat = parseFloat(String(lat));
    const parsedLng = parseFloat(String(lng));
    const startedAt = new Date();

    // Create video and assign to incident
    const { incidentId, isNewVideo } = await ensureVideoWithIncident(
      videoId,
      parsedLat,
      parsedLng,
      startedAt
    );

    // Store session (including filename for replay)
    const session: VideoSession = {
      videoId,
      incidentId,
      lat: parsedLat,
      lng: parsedLng,
      filename,
      ws,
    };
    this.sessions.set(ws, session);

    console.log(`[WS] Session initialized: video=${videoId} incident=${incidentId} filename=${filename || 'none'} isNew=${isNewVideo} (${this.sessions.size} active sessions)`);

    // Broadcast new video event if this is new
    if (isNewVideo) {
      sseManager.broadcast('newVideo', {
        videoId,
        incidentId,
        lat: parsedLat,
        lng: parsedLng,
        status: 'live',
        filename,
        timestamp: new Date().toISOString(),
      });
    }

    // Send confirmation
    ws.send(JSON.stringify({
      type: 'initialized',
      videoId,
      incidentId,
      isNewVideo,
    }));
  }

  /**
   * Handle snapshot message - store and buffer
   */
  private async handleSnapshot(ws: WebSocket, message: SnapshotMessage): Promise<void> {
    const session = this.sessions.get(ws);

    if (!session) {
      ws.send(JSON.stringify({ type: 'error', message: 'Session not initialized. Send init first.' }));
      return;
    }

    const { scenario, data, timestamp } = message;

    if (!scenario) {
      ws.send(JSON.stringify({ type: 'error', message: 'Missing required field: scenario' }));
      return;
    }

    const snapshotTimestamp = timestamp ? new Date(timestamp) : new Date();

    // Insert snapshot
    const [newSnapshot] = await db.insert(snapshots).values({
      videoId: session.videoId,
      timestamp: snapshotTimestamp,
      lat: session.lat,
      lng: session.lng,
      type: 'overshoot_analysis',
      scenario,
      data: data || {},
    }).returning();

    console.log(`[WS] Snapshot received: video=${session.videoId} id=${newSnapshot.id} scenario=${scenario}`);

    // Add to buffer for batch processing (keyed by videoId to prevent mixing)
    snapshotBuffer.add(session.videoId, newSnapshot);

    // Broadcast snapshot received
    sseManager.broadcast('snapshotReceived', {
      videoId: session.videoId,
      snapshot: {
        id: newSnapshot.id,
        timestamp: newSnapshot.timestamp,
        type: newSnapshot.type,
        scenario: newSnapshot.scenario,
      },
      timestamp: new Date().toISOString(),
    });

    // Send ack
    ws.send(JSON.stringify({
      type: 'snapshot_ack',
      snapshotId: newSnapshot.id,
    }));
  }

  /**
   * Handle explicit videoEnded message from client
   */
  private async handleVideoEnded(ws: WebSocket, message: VideoEndedMessage): Promise<void> {
    const session = this.sessions.get(ws);

    if (!session) {
      ws.send(JSON.stringify({ type: 'error', message: 'Session not initialized. Send init first.' }));
      return;
    }

    console.log(`[WS] Video ended explicitly: video=${session.videoId} filename=${session.filename || 'none'}`);

    // Mark video as ended
    await updateVideoStatus(session.videoId, 'ended');

    // Broadcast video ended with filename for replay
    sseManager.broadcast('videoStatusChanged', {
      videoId: session.videoId,
      status: 'ended',
      filename: session.filename,
      timestamp: message.timestamp || new Date().toISOString(),
    });

    // Send confirmation
    ws.send(JSON.stringify({
      type: 'videoEnded_ack',
      videoId: session.videoId,
    }));
  }

  /**
   * Handle client disconnect - mark video as ended
   */
  private async handleDisconnect(ws: WebSocket): Promise<void> {
    const session = this.sessions.get(ws);

    if (session) {
      console.log(`[WS] Session ended: video=${session.videoId} incident=${session.incidentId} filename=${session.filename || 'none'}`);

      // Mark video as ended
      await updateVideoStatus(session.videoId, 'ended');

      // Broadcast video ended with filename for replay
      sseManager.broadcast('videoStatusChanged', {
        videoId: session.videoId,
        status: 'ended',
        filename: session.filename,
        timestamp: new Date().toISOString(),
      });

      // Clean up session
      this.sessions.delete(ws);
      console.log(`[WS] Session cleaned up. Active sessions: ${this.sessions.size}`);
    } else {
      console.log(`[WS] Uninitialized connection closed`);
    }
  }

  /**
   * Get active session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Get all active video IDs
   */
  getActiveVideoIds(): string[] {
    return Array.from(this.sessions.values()).map(s => s.videoId);
  }
}

// Export singleton
export const snapshotWsManager = new SnapshotWebSocketManager();
