# Dashboard Client API Integration

## Overview

The Dashboard client displays real-time emergency incidents to operators. It uses SSE (Server-Sent Events) for live updates and REST endpoints for initial data loading.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Dashboard Client                         │
│                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│   │  Incident   │    │  Timeline   │    │    Map      │    │
│   │    List     │    │    View     │    │    View     │    │
│   └─────────────┘    └─────────────┘    └─────────────┘    │
│          │                  │                  │            │
└──────────┼──────────────────┼──────────────────┼────────────┘
           │                  │                  │
           ▼                  ▼                  ▼
    ┌─────────────────────────────────────────────────┐
    │              Emergency Copilot API              │
    │                                                 │
    │   SSE /stream (global broadcast)               │
    │   REST /incidents, /videos, /snapshots         │
    └─────────────────────────────────────────────────┘
```

---

## Integration Flow

### 1. Load Initial Data

On app load, fetch active incidents and videos:

```
GET /incidents?status=active
GET /videos?status=live
```

**Incidents Response:**
```json
[
  {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "status": "active",
    "lat": 37.7749,
    "lng": -122.4194,
    "startedAt": "2026-01-17T10:00:00.000Z",
    "createdAt": "2026-01-17T10:00:00.000Z",
    "updatedAt": "2026-01-17T10:15:00.000Z"
  }
]
```

### 2. Connect to Global SSE

Connect to receive real-time notifications about all incidents and videos:

```
GET /stream?clientId=dashboard-123
```

This single connection broadcasts ALL events. Keep it open for the dashboard session lifetime.

### 3. Filter Events Client-Side

When the user selects an incident/video, filter incoming SSE events by `incidentId` or `videoId` in the payload:

```typescript
eventSource.addEventListener('timelineEvent', (e) => {
  const data = JSON.parse(e.data);
  if (data.videoId === selectedVideoId) {
    // Update timeline for this video
  }
});
```

### 4. Fetch Details on Selection

When user clicks an incident, fetch its full details via REST:

```
GET /incidents/:id          # Get incident with videos
GET /incidents/:id/timeline # Get timeline events
```

### 5. Handle SSE Events

Update UI as events arrive (see SSE Events section below).

---

## SSE Connection

### Global Stream: `GET /stream`

**Purpose:** Receive all real-time notifications about incidents, videos, and timeline events.

**When to connect:** On dashboard load. Keep open for the entire session.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `clientId` | string | Optional custom client identifier |

**Events received:**

| Event | When | Payload |
|-------|------|---------|
| `connected` | On connect | `{ clientId, timestamp }` |
| `newVideo` | New video starts | `{ videoId, incidentId, lat, lng, status, timestamp }` |
| `snapshotReceived` | Snapshot received | `{ videoId, timestamp }` |
| `timelineEvent` | AI generates insight | `{ videoId, event, timestamp }` |
| `stateUpdated` | AI updates summary | `{ videoId, incidentId, state, timestamp }` |
| `videoStatusChanged` | Video status changes | `{ videoId, status, videoUrl?, timestamp }` |

**Important:** All events are broadcast to all connected clients. Filter events client-side by checking `videoId` or `incidentId` in the payload to handle only relevant events.

---

## SSE Event Payloads

### `connected`

Sent immediately when SSE connection is established.

```json
{
  "clientId": "dashboard-123",
  "timestamp": "2026-01-17T10:30:00.000Z"
}
```

### `newVideo`

A new video stream started. Broadcast globally.

```json
{
  "videoId": "550e8400-e29b-41d4-a716-446655440000",
  "incidentId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "lat": 37.7749,
  "lng": -122.4194,
  "status": "live",
  "timestamp": "2026-01-17T10:00:00.000Z"
}
```

**Action:** If `incidentId` matches current view, add video to list. If new incident, add to incident list or show notification.

### `snapshotReceived`

A caller's device sent a new observation. High frequency during active streams (~1/second per video).

```json
{
  "videoId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-01-17T10:05:30.000Z"
}
```

**Action:** Optional - show activity indicator, update snapshot count. Consider debouncing UI updates due to high frequency.

### `timelineEvent`

AI processed snapshots and generated a meaningful event.

```json
{
  "videoId": "550e8400-e29b-41d4-a716-446655440000",
  "event": {
    "id": "event-uuid",
    "videoId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-01-17T10:05:00.000Z",
    "description": "Person exits vehicle, appears to be limping",
    "fromState": { "location": "inside_vehicle" },
    "toState": { "location": "outside_vehicle", "condition": "injured" },
    "confidence": 0.87,
    "sourceSnapshots": ["snapshot-uuid-1", "snapshot-uuid-2"],
    "createdAt": "2026-01-17T10:05:05.000Z"
  },
  "timestamp": "2026-01-17T10:05:05.000Z"
}
```

**Action:** Append to timeline view. This is the primary way operators see what's happening.

### `stateUpdated`

AI updated its overall assessment of a video (the `currentState` field).

```json
{
  "videoId": "550e8400-e29b-41d4-a716-446655440000",
  "incidentId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "state": "Two vehicle collision. One person exiting vehicle, appears injured. Second vehicle has airbag deployed.",
  "timestamp": "2026-01-17T10:10:00.000Z"
}
```

**Action:** Update the video's state summary display. This is a human-readable AI-generated description.

### `videoStatusChanged`

A video stream ended or recording became available.

```json
{
  "videoId": "550e8400-e29b-41d4-a716-446655440000",
  "incidentId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "status": "recorded",
  "videoUrl": "https://storage.example.com/recordings/abc123.mp4",
  "timestamp": "2026-01-17T10:20:00.000Z"
}
```

| Status | Meaning |
|--------|---------|
| `ended` | Stream stopped, no recording yet |
| `recorded` | Recording available at `videoUrl` |

**Action:** Update video status indicator. If `recorded`, enable playback button.

---

## REST Endpoints

### List Incidents

```
GET /incidents?status=active&limit=50
```

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `status` | string | - | Filter: `active`, `resolved`, `archived` |
| `limit` | number | 50 | Max results |

### Get Incident Details

```
GET /incidents/:id
```

Returns incident with nested videos and counts:

```json
{
  "id": "...",
  "status": "active",
  "currentState": { ... },
  "lat": 37.7749,
  "lng": -122.4194,
  "videos": [ ... ],
  "snapshotCount": 145,
  "timelineEventCount": 12
}
```

### Get Timeline

```
GET /incidents/:id/timeline
```

Returns array of timeline events in chronological order.

### Get Snapshots (Debug)

```
GET /incidents/:id/snapshots?limit=100
```

Returns raw snapshots. Useful for debugging, not typically shown to operators.

### List Videos

```
GET /videos?incidentId=...&status=live
```

| Param | Type | Description |
|-------|------|-------------|
| `incidentId` | string | Filter by incident |
| `status` | string | Filter: `live`, `ended`, `recorded` |

---

## Connection Management

### SSE Reconnection

EventSource auto-reconnects on disconnect. Handle the `error` event for UI feedback:

```typescript
eventSource.onerror = () => {
  // Show "Reconnecting..." indicator
};

eventSource.onopen = () => {
  // Hide reconnection indicator
};
```

### Multiple Incident Views

Since there's a single global SSE stream, you don't need multiple SSE connections. Filter events client-side by `incidentId` or `videoId`:

```typescript
eventSource.addEventListener('timelineEvent', (e) => {
  const data = JSON.parse(e.data);
  // Update timeline for whichever incident/video matches
  if (data.videoId === currentlyViewedVideoId) {
    updateTimeline(data.event);
  }
});
```

### Cleanup

Close the SSE connection when:
- Dashboard unmounts
- User logs out

---

## Data Types

### Incident Status

| Value | Description |
|-------|-------------|
| `active` | Ongoing emergency |
| `resolved` | Emergency handled |
| `archived` | Historical record |

### Video Status

| Value | Description |
|-------|-------------|
| `live` | Currently streaming |
| `ended` | Stream stopped |
| `recorded` | Recording available |

### Coordinates

- `lat`: Latitude (-90 to 90)
- `lng`: Longitude (-180 to 180)

---

## Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

Production:
```env
NEXT_PUBLIC_API_URL=https://api.yourapp.com
```

---

## Notes

- **Heartbeat:** SSE sends heartbeat comments every 30 seconds to keep connections alive
- **Late-join:** Fetch initial state via REST (`GET /incidents`, `GET /videos`) when dashboard loads, then receive updates via SSE
- **Debounce:** `snapshotReceived` fires frequently (~1/second per video). Debounce UI updates if needed.
- **Video streaming:** This API does not handle live video playback. Use LiveKit or a WebRTC streaming service separately.
- **Single connection:** Use one SSE connection for all events. Filter by `videoId`/`incidentId` client-side.
