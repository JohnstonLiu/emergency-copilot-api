import type { Snapshot } from '../models';
import { SNAPSHOT_BATCH_WINDOW_MS, SNAPSHOT_BATCH_MIN_SIZE, SNAPSHOT_BATCH_MAX_SIZE } from '../config/env';

/**
 * Callback function type for when a batch is ready to be processed
 */
export type BatchCallback = (incidentId: string, snapshots: Snapshot[]) => Promise<void>;

/**
 * Buffer state for a single incident
 */
interface IncidentBuffer {
  snapshots: Snapshot[];
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Service that accumulates snapshots per incident for batched processing.
 * Flushes when:
 * - Timer expires AND buffer has >= minBatchSize snapshots
 * - Buffer reaches max size (immediate flush)
 * - Manual flush is triggered (ignores minimum)
 */
class SnapshotBuffer {
  private buffers: Map<string, IncidentBuffer> = new Map();
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
   * Add a snapshot to the buffer for an incident
   * @param incidentId Incident ID to buffer for
   * @param snapshot Snapshot to add
   */
  add(incidentId: string, snapshot: Snapshot): void {
    let buffer = this.buffers.get(incidentId);

    if (!buffer) {
      buffer = {
        snapshots: [],
        timer: null,
      };
      this.buffers.set(incidentId, buffer);
    }

    buffer.snapshots.push(snapshot);
    console.log(`Buffered snapshot for incident ${incidentId}. Buffer size: ${buffer.snapshots.length}/${this.minBatchSize} min, ${this.maxBatchSize} max`);

    // Start timer if not already running
    if (!buffer.timer) {
      buffer.timer = setTimeout(() => {
        this.timerFlush(incidentId);
      }, this.batchWindowMs);
    }

    // Flush immediately if buffer is full
    if (buffer.snapshots.length >= this.maxBatchSize) {
      console.log(`Buffer full for incident ${incidentId}, flushing...`);
      this.flush(incidentId);
    }
  }

  /**
   * Timer-triggered flush - only processes if minimum batch size is met
   */
  private async timerFlush(incidentId: string): Promise<void> {
    const buffer = this.buffers.get(incidentId);
    
    if (!buffer) return;

    // Clear the timer reference
    buffer.timer = null;

    // Check if we have enough snapshots
    if (buffer.snapshots.length >= this.minBatchSize) {
      console.log(`Timer fired for incident ${incidentId}, processing ${buffer.snapshots.length} snapshots`);
      await this.flush(incidentId);
    } else {
      console.log(`Timer fired for incident ${incidentId}, but only ${buffer.snapshots.length}/${this.minBatchSize} snapshots. Waiting for more...`);
      // Restart timer to check again later
      buffer.timer = setTimeout(() => {
        this.timerFlush(incidentId);
      }, this.batchWindowMs);
    }
  }

  /**
   * Flush the buffer for an incident and process the batch
   * @param incidentId Incident ID to flush
   * @param force Force flush even if below minimum (for shutdown)
   * @returns The flushed snapshots
   */
  async flush(incidentId: string, force: boolean = false): Promise<Snapshot[]> {
    const buffer = this.buffers.get(incidentId);

    if (!buffer || buffer.snapshots.length === 0) {
      return [];
    }

    // Skip if below minimum (unless forced)
    if (!force && buffer.snapshots.length < this.minBatchSize) {
      console.log(`Skipping flush for incident ${incidentId}: ${buffer.snapshots.length}/${this.minBatchSize} minimum`);
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

    console.log(`Flushing ${snapshots.length} snapshots for incident ${incidentId}`);

    // Call the batch callback if set
    if (this.batchCallback) {
      try {
        await this.batchCallback(incidentId, snapshots);
      } catch (error) {
        console.error(`Error in batch callback for incident ${incidentId}:`, error);
      }
    }

    return snapshots;
  }

  /**
   * Flush all incident buffers (forces flush regardless of minimum)
   */
  async flushAll(): Promise<void> {
    const incidentIds = Array.from(this.buffers.keys());
    await Promise.all(incidentIds.map((id) => this.flush(id, true)));
  }

  /**
   * Get the current buffer size for an incident
   * @param incidentId Incident ID to check
   * @returns Number of snapshots in buffer
   */
  getBufferSize(incidentId: string): number {
    return this.buffers.get(incidentId)?.snapshots.length ?? 0;
  }

  /**
   * Get all incident IDs with active buffers
   */
  getActiveIncidents(): string[] {
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
  peek(incidentId: string): Snapshot[] {
    return [...(this.buffers.get(incidentId)?.snapshots ?? [])];
  }
}

// Export singleton instance
export const snapshotBuffer = new SnapshotBuffer();
