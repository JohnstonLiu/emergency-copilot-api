import type { Snapshot } from '../models';
import { SNAPSHOT_BATCH_WINDOW_MS, SNAPSHOT_BATCH_MIN_SIZE, SNAPSHOT_BATCH_MAX_SIZE } from '../config/env';

/**
 * Callback function type for when a batch is ready to be processed
 */
export type BatchCallback = (videoId: string, snapshots: Snapshot[]) => Promise<void>;

/**
 * Buffer state for a single video
 */
interface VideoBuffer {
  snapshots: Snapshot[];
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Service that accumulates snapshots per video for batched processing.
 * Flushes when:
 * - Timer expires AND buffer has >= minBatchSize snapshots
 * - Buffer reaches max size (immediate flush)
 * - Manual flush is triggered (ignores minimum)
 */
class SnapshotBuffer {
  private buffers: Map<string, VideoBuffer> = new Map();
  private batchCallback: BatchCallback | null = null;
  private batchWindowMs: number;
  private minBatchSize: number;
  private maxBatchSize: number;

  constructor(batchWindowMs?: number, minBatchSize?: number, maxBatchSize?: number) {
    this.batchWindowMs = batchWindowMs ?? SNAPSHOT_BATCH_WINDOW_MS;
    this.minBatchSize = minBatchSize ?? SNAPSHOT_BATCH_MIN_SIZE;
    this.maxBatchSize = maxBatchSize ?? SNAPSHOT_BATCH_MAX_SIZE;
  }

  /**
   * Set the callback function to be called when a batch is ready
   */
  setBatchCallback(callback: BatchCallback): void {
    this.batchCallback = callback;
  }

  /**
   * Add a snapshot to the buffer for a video
   * @param videoId Video ID to buffer for
   * @param snapshot Snapshot to add
   */
  add(videoId: string, snapshot: Snapshot): void {
    let buffer = this.buffers.get(videoId);

    if (!buffer) {
      buffer = {
        snapshots: [],
        timer: null,
      };
      this.buffers.set(videoId, buffer);
    }

    buffer.snapshots.push(snapshot);
    console.log(`Buffered snapshot for video ${videoId}. Buffer size: ${buffer.snapshots.length}/${this.minBatchSize} min, ${this.maxBatchSize} max`);

    // Start timer if not already running
    if (!buffer.timer) {
      buffer.timer = setTimeout(() => {
        this.timerFlush(videoId);
      }, this.batchWindowMs);
    }

    // Flush immediately if buffer is full
    if (buffer.snapshots.length >= this.maxBatchSize) {
      console.log(`Buffer full for video ${videoId}, flushing...`);
      this.flush(videoId);
    }
  }

  /**
   * Timer-triggered flush - only processes if minimum batch size is met
   */
  private async timerFlush(videoId: string): Promise<void> {
    const buffer = this.buffers.get(videoId);
    
    if (!buffer) return;

    // Clear the timer reference
    buffer.timer = null;

    // Check if we have enough snapshots
    if (buffer.snapshots.length >= this.minBatchSize) {
      console.log(`Timer fired for video ${videoId}, processing ${buffer.snapshots.length} snapshots`);
      await this.flush(videoId);
    } else {
      console.log(`Timer fired for video ${videoId}, but only ${buffer.snapshots.length}/${this.minBatchSize} snapshots. Waiting for more...`);
      // Restart timer to check again later
      buffer.timer = setTimeout(() => {
        this.timerFlush(videoId);
      }, this.batchWindowMs);
    }
  }

  /**
   * Flush the buffer for a video and process the batch
   * @param videoId Video ID to flush
   * @param force Force flush even if below minimum (for shutdown)
   * @returns The flushed snapshots
   */
  async flush(videoId: string, force: boolean = false): Promise<Snapshot[]> {
    const buffer = this.buffers.get(videoId);

    if (!buffer || buffer.snapshots.length === 0) {
      return [];
    }

    // Skip if below minimum (unless forced)
    if (!force && buffer.snapshots.length < this.minBatchSize) {
      console.log(`Skipping flush for video ${videoId}: ${buffer.snapshots.length}/${this.minBatchSize} minimum`);
      return [];
    }

    // Clear the timer
    if (buffer.timer) {
      clearTimeout(buffer.timer);
      buffer.timer = null;
    }

    // Get snapshots and clear buffer
    const snapshots = [...buffer.snapshots];
    buffer.snapshots = [];

    console.log(`Flushing ${snapshots.length} snapshots for video ${videoId}`);

    // Call the batch callback if set
    if (this.batchCallback) {
      try {
        await this.batchCallback(videoId, snapshots);
      } catch (error) {
        console.error(`Error in batch callback for video ${videoId}:`, error);
      }
    }

    return snapshots;
  }

  /**
   * Flush all video buffers (forces flush regardless of minimum)
   */
  async flushAll(): Promise<void> {
    const videoIds = Array.from(this.buffers.keys());
    await Promise.all(videoIds.map((id) => this.flush(id, true)));
  }

  /**
   * Get the current buffer size for a video
   * @param videoId Video ID to check
   * @returns Number of snapshots in buffer
   */
  getBufferSize(videoId: string): number {
    return this.buffers.get(videoId)?.snapshots.length ?? 0;
  }

  /**
   * Get all video IDs with active buffers
   */
  getActiveVideos(): string[] {
    return Array.from(this.buffers.keys()).filter(
      (id) => (this.buffers.get(id)?.snapshots.length ?? 0) > 0
    );
  }

  /**
   * Clear all buffers without processing
   */
  clear(): void {
    for (const buffer of this.buffers.values()) {
      if (buffer.timer) {
        clearTimeout(buffer.timer);
      }
    }
    this.buffers.clear();
  }

  /**
   * Get peek at current buffer contents without flushing
   * Useful for providing context to the timeline agent
   */
  peek(videoId: string): Snapshot[] {
    return [...(this.buffers.get(videoId)?.snapshots ?? [])];
  }
}

// Export singleton instance
export const snapshotBuffer = new SnapshotBuffer();
