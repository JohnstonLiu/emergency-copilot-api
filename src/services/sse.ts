import type { Response } from 'express';

export type SSEEventType =
  | 'connected'
  | 'newVideo'
  | 'snapshotReceived'
  | 'timelineEvent'
  | 'stateUpdated'
  | 'videoStatusChanged'
  | string;

export interface SSEClient {
  id: string;
  res: Response;
}

class SSEManager {
  private clients: Map<string, SSEClient> = new Map();

  /**
   * Register a new SSE client connection
   */
  addClient(id: string, res: Response): void {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering for nginx
    });

    this.clients.set(id, { id, res });

    // Send initial connection confirmation
    this.sendToClient(id, 'connected', {
      clientId: id,
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

    console.log(`SSE client ${id} connected. Active clients: ${this.clients.size}`);
  }

  /**
   * Remove a client connection
   */
  removeClient(id: string): void {
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
    if (this.clients.size === 0) {
      return;
    }

    console.log(`Broadcasting ${event} to ${this.clients.size} clients`);

    for (const [clientId] of this.clients) {
      this.sendToClient(clientId, event, data);
    }
  }

  /**
   * Get count of active connections
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get all connected client IDs
   */
  getClientIds(): string[] {
    return Array.from(this.clients.keys());
  }
}

// Export singleton instance
export const sseManager = new SSEManager();
