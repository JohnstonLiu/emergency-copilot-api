# Emergency Copilot API Documentation

Base URL: `http://localhost:8080`

## Health Check

### GET /health
Returns server health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "activeSSEClients": 3,
  "activeWebSocketSessions": 2
}
```

---

## Incidents

### GET /incidents
List all incidents.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | - | Filter by status: `active`, `resolved`, `archived` |
| `limit` | number | 50 | Max results to return |

**Response:**
```json
[
  {
    "id": "uuid",
    "status": "active",
    "lat": 37.7749,
    "lng": -122.4194,
    "startedAt": "2024-01-15T10:00:00.000Z",
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
]
```

---

### GET /incidents/:id
Get a specific incident with videos and counts.

**Response:**
```json
{
  "id": "uuid",
  "status": "active",
  "lat": 37.7749,
  "lng": -122.4194,
  "startedAt": "2024-01-15T10:00:00.000Z",
  "createdAt": "2024-01-15T10:00:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z",
  "videos": [...],
  "snapshotCount": 45,
  "timelineEventCount": 12
}
```

---

### GET /incidents/:id/timeline
Get AI-derived timeline events for an incident.

**Response:**
```json
[
  {
    "id": "uuid",
    "videoId": "uuid",
    "timestamp": "2024-01-15T10:05:00.000Z",
    "description": "Man enters building through main entrance",
    "fromState": { "location": "outside" },
    "toState": { "location": "lobby" },
    "confidence": 0.92,
    "sourceSnapshots": ["uuid1", "uuid2"],
    "createdAt": "2024-01-15T10:05:01.000Z"
  }
]
```

---

### GET /incidents/:id/snapshots
Get raw snapshots for an incident (for debugging).

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 100 | Max results to return |

**Response:**
```json
[
  {
    "id": "uuid",
    "videoId": "uuid",
    "timestamp": "2024-01-15T10:05:00.000Z",
    "lat": 37.7749,
    "lng": -122.4194,
    "type": "person_detected",
    "scenario": "suspicious_activity",
    "data": { ... },
    "createdAt": "2024-01-15T10:05:00.000Z",
    "updatedAt": "2024-01-15T10:05:00.000Z"
  }
]
```

---

## Videos

### GET /videos
List all videos.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `status` | string | - | Filter by status: `live`, `ended`, `recorded` |
| `incidentId` | string | - | Filter by incident |
| `limit` | number | 50 | Max results to return |

**Response:**
```json
[
  {
    "id": "uuid",
    "incidentId": "uuid",
    "status": "live",
    "currentState": "Adult male in lobby area, walking toward elevators.",
    "videoUrl": null,
    "lat": 37.7749,
    "lng": -122.4194,
    "startedAt": "2024-01-15T10:00:00.000Z",
    "endedAt": null,
    "createdAt": "2024-01-15T10:00:00.000Z",
    "updatedAt": "2024-01-15T10:00:00.000Z"
  }
]
```

---

### GET /videos/:id
Get a specific video with its AI-generated state summary.

**Response:** Single video object (same shape as list item).

---

### GET /videos/:id/timeline
Get the timeline of AI-derived events for a video.

**Response:**
```json
[
  {
    "id": "uuid",
    "videoId": "uuid",
    "timestamp": "2024-01-15T10:05:00.000Z",
    "description": "Man enters building through main entrance",
    "fromState": { "location": "outside" },
    "toState": { "location": "lobby" },
    "confidence": 0.92,
    "sourceSnapshots": ["uuid1", "uuid2"],
    "createdAt": "2024-01-15T10:05:01.000Z"
  }
]
```

---

### PATCH /videos/:id
Update video status or set recording URL.

**Request Body:**
```json
{
  "status": "ended",
  "videoUrl": "https://storage.example.com/video.mp4"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `live`, `ended`, or `recorded` |
| `videoUrl` | string | URL to recorded video file |

**Response:** Updated video object.

---

## Snapshots

### POST /snapshots
Submit a snapshot from video analysis. Auto-creates video and incident if needed.

**Request Body:**
```json
{
  "videoId": "uuid",
  "timestamp": "2024-01-15T10:05:00.000Z",
  "lat": 37.7749,
  "lng": -122.4194,
  "type": "person_detected",
  "scenario": "suspicious_activity",
  "data": {
    "description": "Adult male wearing dark clothing",
    "confidence": 0.95
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `videoId` | string | Yes | Video UUID (provided by client) |
| `timestamp` | string | No | ISO timestamp (defaults to now) |
| `lat` | number | Yes | Latitude |
| `lng` | number | Yes | Longitude |
| `type` | string | Yes | Snapshot type (e.g., `person_detected`) |
| `scenario` | string | Yes | Scenario classification |
| `data` | object | No | Additional structured data |

**Response:**
```json
{
  "snapshotId": "uuid",
  "incidentId": "uuid",
  "videoId": "uuid",
  "isNewVideo": true
}
```

---

### GET /snapshots
List all snapshots.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `videoId` | string | - | Filter by video |
| `incidentId` | string | - | Filter by incident (via video) |
| `limit` | number | 50 | Max results to return |

**Response:** Array of snapshot objects.

---

### GET /snapshots/:id
Get a specific snapshot.

**Response:** Single snapshot object.

---

## WebSocket

### WS /ws/snapshots
WebSocket endpoint for streaming snapshots (alternative to POST /snapshots).

See [NEXTJS_CLIENT.md](docs/NEXTJS_CLIENT.md) for usage details.

---

## SSE (Server-Sent Events)

### GET /stream
Global SSE endpoint for real-time updates. All events are broadcast to all connected clients.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `clientId` | string | auto-generated | Custom client identifier |

**SSE Events:**

| Event | Description | Payload includes |
|-------|-------------|------------------|
| `connected` | Connection established | `clientId` |
| `newVideo` | New video stream started | `videoId`, `incidentId`, `lat`, `lng` |
| `snapshotReceived` | New snapshot received | `videoId`, `snapshot` |
| `timelineEvent` | New AI-derived timeline event | `videoId`, `event` |
| `stateUpdated` | Video state summary updated | `videoId`, `state` |
| `videoStatusChanged` | Video status changed | `videoId`, `status`, `videoUrl` |

**Example: Connecting and filtering by videoId**
```javascript
const eventSource = new EventSource('/stream');

const myVideoId = 'uuid-of-video-im-watching';

eventSource.addEventListener('timelineEvent', (e) => {
  const data = JSON.parse(e.data);
  if (data.videoId === myVideoId) {
    // Handle event for this video
    console.log('New timeline event:', data.event);
  }
});
```

**Note:** Clients should filter events by `videoId` in the payload to only handle events for videos they care about. Fetch initial state via REST API (`GET /videos/:id`, `GET /videos/:id/timeline`).

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "error": "Error message description"
}
```

| Status Code | Description |
|-------------|-------------|
| 400 | Bad Request - Missing or invalid parameters |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |
