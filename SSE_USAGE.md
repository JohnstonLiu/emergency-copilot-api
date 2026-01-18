# SSE (Server-Sent Events) Usage Guide

## Overview

The SSE infrastructure is set up to broadcast real-time updates to connected clients. All the scaffolding is in place—you just need to emit events where needed.

## How It Works

### 1. Endpoint
Clients connect to: `GET /stream?clientId=<optional-id>`

### 2. Emitting Events

Use the `sseManager` singleton anywhere in your code:

```typescript
import { sseManager } from './services/sse';

// Broadcast to all connected clients
sseManager.broadcast('newCaller', {
  callerId: '123',
  phoneNumber: '+1234567890',
  timestamp: new Date().toISOString()
});

// Send to specific client
sseManager.sendToClient('client-abc', 'incidentUpdated', {
  incidentId: 'incident-456',
  status: 'escalated'
});

// Check active connections
const count = sseManager.getClientCount();
console.log(`${count} clients connected`);
```

## Current Event Types

The following SSE event types are used:

| Event | Description | Payload |
|-------|-------------|---------|
| `connected` | Connection established | `{ clientId, timestamp }` |
| `newVideo` | New video stream started | `{ videoId, incidentId, lat, lng, status, timestamp }` |
| `snapshotReceived` | New snapshot received | `{ videoId, timestamp }` |
| `timelineEvent` | AI-generated timeline event | `{ videoId, event, timestamp }` |
| `stateUpdated` | Video state summary updated | `{ videoId, incidentId, state, timestamp }` |
| `videoStatusChanged` | Video status changed | `{ videoId, status, videoUrl?, timestamp }` |

## Adding New Event Types

Edit `/src/services/sse.ts` and add to the `SSEEventType` union:

```typescript
export type SSEEventType =
  | 'connected'
  | 'newVideo'
  | 'snapshotReceived'
  | 'timelineEvent'
  | 'stateUpdated'
  | 'videoStatusChanged'
  | 'yourNewEvent'  // Add here
  | string;
```

## Example Implementation Spots

### When a new video stream starts:
```typescript
// In snapshotWebSocket.ts or snapshot route
sseManager.broadcast('newVideo', {
  videoId: video.id,
  incidentId: video.incidentId,
  lat: video.lat,
  lng: video.lng,
  status: video.status,
  timestamp: new Date().toISOString()
});
```

### When AI generates a timeline event:
```typescript
// In timelineAgent.ts
sseManager.broadcast('timelineEvent', {
  videoId: event.videoId,
  event: {
    id: event.id,
    description: event.description,
    confidence: event.confidence,
    timestamp: event.timestamp
  },
  timestamp: new Date().toISOString()
});
```

### When video state is updated:
```typescript
// After AI processing updates the video's currentState
sseManager.broadcast('stateUpdated', {
  videoId: video.id,
  incidentId: video.incidentId,
  state: video.currentState,
  timestamp: new Date().toISOString()
});
```

## Client-Side Usage

See `/src/examples/sse-client.ts` for frontend implementation examples.

### Browser/React Example:
```typescript
useEffect(() => {
  const eventSource = new EventSource('http://localhost:8080/stream');

  eventSource.addEventListener('newVideo', (e) => {
    const data = JSON.parse(e.data);
    // Update your UI
    setVideos(prev => [...prev, data]);
  });

  eventSource.addEventListener('timelineEvent', (e) => {
    const data = JSON.parse(e.data);
    // Handle timeline event
    console.log('New timeline event:', data.event);
  });

  return () => eventSource.close();
}, []);
```

## Testing

```bash
# Terminal 1: Start server
bun dev

# Terminal 2: Test SSE connection
curl -N http://localhost:8080/stream

# Terminal 3: Trigger an event by submitting a snapshot
curl -X POST http://localhost:8080/snapshots \
  -H "Content-Type: application/json" \
  -d '{"videoId": "test-video-id", "lat": 37.77, "lng": -122.41, "type": "test", "scenario": "scene_analysis"}'
```

You should see events appear in Terminal 2.

## Notes

- Heartbeat messages are sent every 30 seconds to keep connections alive
- Clients auto-reconnect on disconnect
- Old clients are cleaned up automatically
- Works with nginx/reverse proxies (X-Accel-Buffering disabled)
