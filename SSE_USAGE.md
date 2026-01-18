# SSE (Server-Sent Events) Usage Guide

## Overview

The SSE infrastructure is set up to broadcast real-time updates to connected clients. All the scaffolding is in place—you just need to emit events where needed.

## How It Works

### 1. Endpoint
Clients connect to: `GET /events/stream?clientId=<optional-id>`

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

## Adding New Event Types

Edit `/src/services/sse.ts` and add to the `SSEEventType` union:

```typescript
export type SSEEventType = 
  | 'newCaller'
  | 'callerDisconnected'
  | 'newIncident'
  | 'incidentUpdated'
  | 'yourNewEvent'  // Add here
  | string;
```

## Example Implementation Spots

### When a new caller connects:
```typescript
app.post("/callers", (req, res) => {
  const caller = req.body;
  callers.push(caller);
  
  sseManager.broadcast('newCaller', {
    caller,
    timestamp: new Date().toISOString()
  });
  
  res.status(CREATED).send(caller);
});
```

### When an incident is created:
```typescript
const incident = createIncident(...);
incidents.push(incident);

sseManager.broadcast('newIncident', {
  incident,
  timestamp: new Date().toISOString()
});
```

### When weapons are detected:
```typescript
if (event.data.weapons.firearm.present) {
  sseManager.broadcast('weaponDetected', {
    incidentId: incident.id,
    weaponType: 'firearm',
    severity: 'critical',
    coords: event.coords
  });
}
```

## Client-Side Usage

See `/src/examples/sse-client.ts` for frontend implementation examples.

### Browser/React Example:
```typescript
useEffect(() => {
  const eventSource = new EventSource('http://localhost:8080/events/stream');
  
  eventSource.addEventListener('newIncident', (e) => {
    const data = JSON.parse(e.data);
    // Update your UI
    setIncidents(prev => [...prev, data.incident]);
  });
  
  return () => eventSource.close();
}, []);
```

## Testing

```bash
# Terminal 1: Start server
bun dev

# Terminal 2: Test SSE connection
curl -N http://localhost:8080/events/stream

# Terminal 3: Trigger an event
curl -X POST http://localhost:8080/events \
  -H "Content-Type: application/json" \
  -d '{"event": {...}}'
```

You should see the event appear in Terminal 2.

## Notes

- Heartbeat messages are sent every 30 seconds to keep connections alive
- Clients auto-reconnect on disconnect
- Old clients are cleaned up automatically
- Works with nginx/reverse proxies (X-Accel-Buffering disabled)
