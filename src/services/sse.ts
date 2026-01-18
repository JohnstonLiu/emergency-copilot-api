import type { Response } from 'express';

export type SSEEventType =
  | 'connected'
  | 'newVideo'
  | 'videoDisconnected'
  | 'newIncident'
  | 'incidentUpdated'
  | 'newSnapshot'
  | 'snapshotReceived'
  | 'timelineEvent'
  | 'stateUpdated'
  | string;

export interface SSEClient {
  id: string;
  res: Response;
  incidentId?: string; // The incident this client is subscribed to
}

/**
 * Callback type for fetching current state when a client connects
 */
export type FetchCurrentStateCallback = (incidentId: string) => Promise<{
  incident: unknown;
  timeline: unknown[];
} | null>;

class SSEManager {
  private clients: Map<string, SSEClient> = new Map();
  private incidentSubscriptions: Map<string, Set<string>> = new Map(); // incidentId -> clientIds
  private fetchCurrentStateCallback: FetchCurrentStateCallback | null = null;

  /**
   * Set the callback for fetching current state (used for late-join support)
   */
  setFetchCurrentStateCallback(callback: FetchCurrentStateCallback): void {
    this.fetchCurrentStateCallback = callback;
  }

  /**
   * Register a new SSE client connection (global, not incident-specific)
   */
  addClient(id: string, res: Response): void {
    this.setupClient(id, res);
  }

  /**
   * Subscribe a client to a specific incident's updates
   * @param clientId Client ID
   * @param incidentId Incident ID to subscribe to
   * @param res Express response object
   */
  async subscribeToIncident(clientId: string, incidentId: string, res: Response): Promise<void> {
    // Setup the client connection
    this.setupClient(clientId, res, incidentId);

    // Add to incident subscriptions
    if (!this.incidentSubscriptions.has(incidentId)) {
      this.incidentSubscriptions.set(incidentId, new Set());
    }
    this.incidentSubscriptions.get(incidentId)!.add(clientId);

    console.log(
      `Client ${clientId} subscribed to incident ${incidentId}. ` +
      `Total subscribers for incident: ${this.incidentSubscriptions.get(incidentId)!.size}`
    );

    // Send current state for late-joining clients
    await this.sendCurrentState(clientId, incidentId);
  }

  /**
   * Setup SSE client with headers and heartbeat
   */
  private setupClient(id: string, res: Response, incidentId?: string): void {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering for nginx
    });

    this.clients.set(id, { id, res, incidentId });

    // Send initial connection confirmation
    this.sendToClient(id, 'connected', {
      clientId: id,
      incidentId: incidentId ?? null,
      timestamp: new Date().toISOString(),
    });

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      if (this.clients.has(id)) {
        res.write(`: heartbeat\n\n`);
      } else {
        clearInterval(heartbeat);
      }
    }, 30000); // Every 30 seconds

    // Clean up on close
    res.on('close', () => {
      clearInterval(heartbeat);
      this.removeClient(id);
    });
  }

  /**
   * Remove a client connection
   */
  removeClient(id: string): void {
    const client = this.clients.get(id);

    // Remove from incident subscriptions
    if (client?.incidentId) {
      const subscribers = this.incidentSubscriptions.get(client.incidentId);
      if (subscribers) {
        subscribers.delete(id);
        if (subscribers.size === 0) {
          this.incidentSubscriptions.delete(client.incidentId);
        }
      }
    }

    this.clients.delete(id);
    console.log(`SSE client ${id} disconnected. Active clients: ${this.clients.size}`);
  }

  /**
   * Send event to a specific client
   */
  sendToClient(clientId: string, event: SSEEventType, data: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    try {
      const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      client.res.write(message);
      return true;
    } catch (error) {
      console.error(`Error sending to client ${clientId}:`, error);
      this.removeClient(clientId);
      return false;
    }
  }

  /**
   * Broadcast event to all connected clients
   */
  broadcast(event: SSEEventType, data: unknown): void {
    console.log(`Broadcasting ${event} to ${this.clients.size} clients`);

    for (const [clientId] of this.clients) {
      this.sendToClient(clientId, event, data);
    }
  }

  /**
   * Broadcast event to all clients subscribed to a specific incident
   */
  broadcastToIncident(incidentId: string, event: SSEEventType, data: unknown): void {
    const subscribers = this.incidentSubscriptions.get(incidentId);
    if (!subscribers || subscribers.size === 0) {
      console.log(`No subscribers for incident ${incidentId}, skipping broadcast`);
      return;
    }

    console.log(`Broadcasting ${event} to ${subscribers.size} clients for incident ${incidentId}`);

    for (const clientId of subscribers) {
      this.sendToClient(clientId, event, data);
    }
  }

  /**
   * Send current incident state to a client (late-join support)
   */
  async sendCurrentState(clientId: string, incidentId: string): Promise<void> {
    if (!this.fetchCurrentStateCallback) {
      console.warn('No fetchCurrentStateCallback set, cannot send current state');
      return;
    }

    try {
      const currentState = await this.fetchCurrentStateCallback(incidentId);
      if (currentState) {
        this.sendToClient(clientId, 'currentState', {
          incidentId,
          incident: currentState.incident,
          timeline: currentState.timeline,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error(`Error fetching current state for incident ${incidentId}:`, error);
    }
  }

  /**
   * Get count of active connections
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get count of subscribers for an incident
   */
  getIncidentSubscriberCount(incidentId: string): number {
    return this.incidentSubscriptions.get(incidentId)?.size ?? 0;
  }

  /**
   * Get all connected client IDs
   */
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Get all incident IDs with active subscribers
   */
  getActiveIncidents(): string[] {
    return Array.from(this.incidentSubscriptions.keys());
  }
}

// Export singleton instance
export const sseManager = new SSEManager();
