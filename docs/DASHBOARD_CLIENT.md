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
    │   SSE /stream          SSE /incidents/:id/stream│
    │   REST /incidents      REST /incidents/:id      │
    └─────────────────────────────────────────────────┘
```

---

## Integration Flow

### 1. Load Initial Data

On app load, fetch active incidents:

```
GET /incidents?status=active
```

**Response:**
```json
[
  {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "status": "active",
    "currentState": { "severity": "high", "type": "vehicle_accident" },
    "lat": 37.7749,
    "lng": -122.4194,
    "radius": 100,
    "startedAt": "2026-01-17T10:00:00.000Z",
    "createdAt": "2026-01-17T10:00:00.000Z",
    "updatedAt": "2026-01-17T10:15:00.000Z"
  }
]
```

### 2. Connect to Global SSE

Connect to receive notifications about **new** incidents and videos:

```
GET /stream?clientId=dashboard-123
```

This connection should stay open for the lifetime of the dashboard session.

### 3. User Selects an Incident

When user clicks an incident, connect to its specific SSE stream:

```
GET /incidents/:id/stream?clientId=dashboard-123
```

This provides:
- Current state on connect (late-join support)
- Real-time updates for that incident

### 4. Handle SSE Events

Update UI as events arrive (see SSE Events section below).

---

## SSE Connections

### Global Stream: `GET /stream`

**Purpose:** Receive notifications about new incidents and videos across the system.

**When to connect:** On dashboard load, keep open always.

**Events received:**

| Event | Payload |
|-------|---------|
| `connected` | `{ clientId, incidentId: null, timestamp }` |
| `newVideo` | `{ videoId, incidentId, lat, lng, status, timestamp }` |

### Incident Stream: `GET /incidents/:id/stream`

**Purpose:** Receive detailed updates for a specific incident.

**When to connect:** When user selects/views an incident.

**Events received:**

| Event | When | Payload |
|-------|------|---------|
| `connected` | On connect | `{ clientId, incidentId, timestamp }` |
| `currentState` | Immediately after connect | Full incident state (see below) |
| `snapshotReceived` | New observation from caller | `{ incidentId, snapshot, timestamp }` |
| `timelineEvent` | AI generates insight | `{ videoId, event, timestamp }` |
| `stateUpdated` | AI updates assessment | `{ incidentId, state, timestamp }` |
| `videoStatusChanged` | Video ends or recording ready | `{ videoId, incidentId, status, videoUrl?, timestamp }` |

---

## SSE Event Payloads

### `connected`

Sent immediately when SSE connection is established.

```json
{
  "clientId": "dashboard-123",
  "incidentId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "timestamp": "2026-01-17T10:30:00.000Z"
}
```

### `currentState`

Sent immediately after `connected` on incident-specific streams. Provides full state for late-joining clients.

```json
{
  "incidentId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "incident": {
    "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "status": "active",
    "currentState": { "severity": "high", "injuries": true },
    "lat": 37.7749,
    "lng": -122.4194,
    "videos": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "status": "live",
        "lat": 37.7749,
        "lng": -122.4194,
        "startedAt": "2026-01-17T10:00:00.000Z"
      }
    ]
  },
  "timeline": [
    {
      "id": "event-uuid",
      "videoId": "550e8400-e29b-41d4-a716-446655440000",
      "timestamp": "2026-01-17T10:05:00.000Z",
      "description": "Two vehicles involved in collision",
      "confidence": 0.92
    }
  ],
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

A caller's device sent a new observation. High frequency during active streams.

```json
{
  "incidentId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "snapshot": {
    "id": "snapshot-uuid",
    "timestamp": "2026-01-17T10:05:30.000Z",
    "type": "overshoot_analysis",
    "scenario": "vehicle_accident"
  },
  "timestamp": "2026-01-17T10:05:30.000Z"
}
```

**Action:** Optional - show activity indicator, update snapshot count. May want to debounce UI updates.

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

AI updated its overall assessment of the incident.

```json
{
  "incidentId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "state": {
    "severity": "critical",
    "type": "vehicle_accident",
    "injuries": true,
    "injuryCount": 2,
    "vehicleCount": 2,
    "hazards": ["fuel_leak"]
  },
  "timestamp": "2026-01-17T10:10:00.000Z"
}
```

**Action:** Update incident summary/header with new assessment.

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

```
eventSource.onerror → show "Reconnecting..." indicator
eventSource.onopen → hide indicator
```

### Multiple Incident Views

If operators can view multiple incidents simultaneously, maintain separate SSE connections for each:

```
/incidents/incident-1/stream
/incidents/incident-2/stream
```

### Cleanup

Close SSE connections when:
- User navigates away from incident
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
- **Late-join:** `currentState` event ensures clients see full state even if they connect mid-incident
- **Debounce:** `snapshotReceived` fires frequently (~1/second per video). Debounce UI updates if needed.
- **Video streaming:** This API does not handle live video playback. Use WebRTC or a streaming service separately.
