# Next.js Client API Integration

## Overview

The Next.js client captures live video using the Overshoot SDK and streams analysis results to the Emergency Copilot API. After streaming ends, the client uploads the recording and notifies the API.

---

## Endpoints Used

| Endpoint | Purpose |
|----------|---------|
| `WS /ws/snapshots` | Stream Overshoot snapshots in real-time |
| `PATCH /videos/:id` | Set video recording URL after upload |

---

## Client Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. User starts streaming                                       │
│     └── Connect to WS /ws/snapshots                             │
│     └── Send init { videoId, lat, lng }                         │
│                                                                 │
│  2. During streaming                                            │
│     └── Overshoot produces results                              │
│     └── Send snapshot { scenario, data } via WebSocket          │
│                                                                 │
│  3. User stops streaming                                        │
│     └── Close WebSocket (server auto-marks video as "ended")    │
│                                                                 │
│  4. Upload recording                                            │
│     └── Upload video file to storage (S3, Cloudinary, etc.)     │
│                                                                 │
│  5. Notify API                                                  │
│     └── PATCH /videos/:id with videoUrl                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## WebSocket: `/ws/snapshots`

### Connection

```
ws://your-api-host/ws/snapshots
```

On connect, server sends:
```json
{
  "type": "connected",
  "message": "Send init message with videoId, lat, lng"
}
```

---

### Message: `init`

**Send once** when user starts streaming. Creates the video record and assigns it to an incident.

**Client sends:**
```json
{
  "type": "init",
  "videoId": "550e8400-e29b-41d4-a716-446655440000",
  "lat": 37.7749,
  "lng": -122.4194
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"init"` | Yes | Message type |
| `videoId` | string (UUID) | Yes | Unique ID for this video session. Generate client-side. |
| `lat` | number | Yes | User's GPS latitude |
| `lng` | number | Yes | User's GPS longitude |

**Server responds:**
```json
{
  "type": "initialized",
  "videoId": "550e8400-e29b-41d4-a716-446655440000",
  "incidentId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "isNewVideo": true
}
```

| Field | Description |
|-------|-------------|
| `videoId` | Echo of your video ID |
| `incidentId` | The incident this video was assigned to (new or existing) |
| `isNewVideo` | `true` if video was just created, `false` if it already existed |

---

### Message: `snapshot`

**Send each time** Overshoot produces an analysis result.

**Client sends:**
```json
{
  "type": "snapshot",
  "scenario": "vehicle_accident",
  "timestamp": "2026-01-17T10:30:00.000Z",
  "data": {
    "raw_output": "Two vehicles involved in collision. Driver exiting vehicle.",
    "confidence": 0.92,
    "detected_objects": ["car", "car", "person"]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"snapshot"` | Yes | Message type |
| `scenario` | string | Yes | What was detected (see scenarios below) |
| `timestamp` | ISO 8601 string | No | When observation occurred. Defaults to server time. |
| `data` | object | No | Full Overshoot response. Store whatever is useful. |

**Common scenario values:**
- `scene_analysis` - General scene description
- `vehicle_accident` - Vehicle collision detected
- `fire` - Fire or smoke detected
- `injury` - Visible injury detected
- `weapon` - Weapon detected
- `person_down` - Person on ground
- `crowd` - Large gathering of people

**Server responds:**
```json
{
  "type": "snapshot_ack",
  "snapshotId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

---

### Disconnect

When the WebSocket closes (user stops streaming, app closes, connection lost), the server automatically:

1. Marks video status as `"ended"`
2. Sets `endedAt` timestamp
3. Broadcasts `videoStatusChanged` event to dashboard clients

**No explicit "end" message needed.** Just close the connection.

---

### Error Messages

Server may send:
```json
{
  "type": "error",
  "message": "Description of what went wrong"
}
```

| Error Message | Cause |
|---------------|-------|
| `"Missing required fields: videoId, lat, lng"` | Init message incomplete |
| `"Session not initialized. Send init first."` | Sent snapshot before init |
| `"Session already initialized"` | Sent init twice on same connection |
| `"Missing required field: scenario"` | Snapshot missing scenario field |

---

## REST: `PATCH /videos/:id`

After the stream ends and you've uploaded the recording, notify the API with the video URL.

### Request

```
PATCH /videos/550e8400-e29b-41d4-a716-446655440000
Content-Type: application/json

{
  "status": "recorded",
  "videoUrl": "https://your-storage.com/recordings/abc123.mp4"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | `"recorded"` | Yes | Indicates recording is available |
| `videoUrl` | string | Yes | Public URL to the video recording |

### Response

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "incidentId": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "status": "recorded",
  "videoUrl": "https://your-storage.com/recordings/abc123.mp4",
  "lat": 37.7749,
  "lng": -122.4194,
  "startedAt": "2026-01-17T10:00:00.000Z",
  "endedAt": "2026-01-17T10:15:00.000Z",
  "createdAt": "2026-01-17T10:00:00.000Z",
  "updatedAt": "2026-01-17T10:20:00.000Z"
}
```

### Error Responses

| Status | Body | Cause |
|--------|------|-------|
| 404 | `{ "error": "Video not found" }` | Invalid video ID |
| 400 | `{ "error": "Invalid status..." }` | Status not one of: `live`, `ended`, `recorded` |

---

## Video Status Lifecycle

```
┌──────────┐     WebSocket      ┌──────────┐     PATCH with     ┌──────────┐
│   live   │ ──────────────────▶│  ended   │ ────────────────▶  │ recorded │
└──────────┘    disconnects     └──────────┘     videoUrl       └──────────┘
```

| Status | Meaning |
|--------|---------|
| `live` | Stream is active, receiving snapshots |
| `ended` | Stream stopped, no recording URL yet |
| `recorded` | Recording uploaded and URL available |

---

## Data Types

### Video ID

Generate a UUID v4 client-side when the user starts streaming. Use this same ID for:
- WebSocket `init` message
- `PATCH /videos/:id` request

```
550e8400-e29b-41d4-a716-446655440000
```

### Coordinates

Standard GPS coordinates:
- `lat`: Latitude (-90 to 90)
- `lng`: Longitude (-180 to 180)

### Timestamps

ISO 8601 format with timezone:
```
2026-01-17T10:30:00.000Z
```

---

## Server Behavior

### Incident Assignment

When you send the `init` message, the server:

1. Creates a video record with status `"live"`
2. Looks for an existing active incident within ~100 meters
3. If found, assigns video to that incident
4. If not found, creates a new incident at that location

Multiple callers streaming from the same location are automatically grouped into one incident.

### Snapshot Processing

When you send snapshots:

1. Stored in database immediately
2. Buffered for batch processing
3. When batch is ready, sent to AI (Gemini) for timeline generation
4. AI-generated timeline events broadcast to dashboard clients

### Dashboard Notifications

Dashboard clients subscribed to the incident receive SSE events:

| Event | When |
|-------|------|
| `newVideo` | Your video is created (on `init`) |
| `snapshotReceived` | Each snapshot you send |
| `timelineEvent` | AI generates a timeline event from your snapshots |
| `videoStatusChanged` | Video status changes (`ended`, `recorded`) |

---

## Environment Variables

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_API_WS_URL=ws://localhost:8080
```

For production, use secure protocols:
```env
NEXT_PUBLIC_API_URL=https://api.yourapp.com
NEXT_PUBLIC_API_WS_URL=wss://api.yourapp.com
```
