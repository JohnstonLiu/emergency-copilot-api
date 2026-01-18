# Emergency Copilot API - Workflow Documentation

## Overview

Emergency Copilot API is a Bun/Express.js backend that powers real-time emergency detection and dispatch. It handles video stream ingestion, automatic incident grouping, AI-powered timeline generation, and real-time event broadcasting.

---

## Technology Stack

| Technology | Purpose |
|------------|---------|
| Bun | TypeScript runtime |
| Express.js | HTTP server framework |
| PostgreSQL | Primary database |
| Drizzle ORM | Type-safe database ORM |
| WebSocket (ws) | Real-time snapshot streaming |
| Server-Sent Events | Real-time event broadcasting |
| Google Generative AI (Gemini) | Timeline generation |

---

## Project Structure

```
emergency-copilot-api/
├── src/
│   ├── main.ts                     # Express app initialization
│   ├── config/
│   │   ├── env.ts                  # Environment configuration
│   │   ├── db.ts                   # PostgreSQL connection
│   │   └── http.ts                 # HTTP status constants
│   ├── models/
│   │   └── index.ts                # Drizzle schema definitions
│   ├── routes/
│   │   ├── snapshots.ts            # Snapshot endpoints
│   │   ├── videos.ts               # Video endpoints
│   │   └── incidents.ts            # Incident endpoints
│   ├── services/
│   │   ├── sse.ts                  # Server-Sent Events manager
│   │   ├── snapshotBuffer.ts       # Batch processing service
│   │   ├── timelineAgent.ts        # Gemini AI integration
│   │   ├── incidentGrouper.ts      # Location-based grouping
│   │   └── snapshotWebSocket.ts    # WebSocket server
│   ├── middleware/
│   │   └── logger.ts               # Request logging
│   └── utils/
│       └── geo.ts                  # Geographic calculations
├── drizzle/                         # Database migrations
└── drizzle.config.ts
```

---

## Database Schema

### Tables

```
┌─────────────────────────────────────────────────────────────────┐
│                         INCIDENTS                               │
├─────────────────────────────────────────────────────────────────┤
│ id (UUID, PK)          │ Unique incident identifier            │
│ status                 │ 'active' | 'resolved' | 'archived'    │
│ lat, lng               │ Location coordinates                   │
│ startedAt              │ When incident began                    │
│ createdAt, updatedAt   │ Timestamps                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ 1:N
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          VIDEOS                                 │
├─────────────────────────────────────────────────────────────────┤
│ id (UUID, PK)          │ Video identifier                       │
│ incidentId (FK)        │ Parent incident                        │
│ status                 │ 'live' | 'ended' | 'recorded'         │
│ currentState           │ AI-generated summary                   │
│ videoUrl               │ Recording URL (when available)         │
│ lat, lng               │ Location coordinates                   │
│ startedAt, endedAt     │ Stream timestamps                      │
│ createdAt, updatedAt   │ Timestamps                            │
└─────────────────────────────────────────────────────────────────┘
          │                                    │
          │ 1:N                                │ 1:N
          ▼                                    ▼
┌─────────────────────────┐    ┌─────────────────────────────────┐
│       SNAPSHOTS         │    │       TIMELINE EVENTS           │
├─────────────────────────┤    ├─────────────────────────────────┤
│ id (UUID, PK)          │    │ id (UUID, PK)                    │
│ videoId (FK)           │    │ videoId (FK)                     │
│ timestamp              │    │ timestamp                        │
│ lat, lng               │    │ description                      │
│ type                   │    │ fromState, toState (jsonb)       │
│ scenario               │    │ confidence                       │
│ data (jsonb)           │    │ sourceSnapshots (jsonb)          │
│ createdAt, updatedAt   │    │ createdAt                        │
└─────────────────────────┘    └─────────────────────────────────┘
```

---

## Core Workflows

### Workflow 1: Snapshot Ingestion

Snapshots can be submitted via REST API or WebSocket.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SNAPSHOT INGESTION                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   REST API                          WebSocket                   │
│   POST /snapshots                   /ws/snapshots               │
│        │                                 │                      │
│        │                     ┌───────────┘                      │
│        │                     │                                  │
│        ▼                     ▼                                  │
│   ┌─────────────────────────────────────────────┐              │
│   │         ensureVideoWithIncident()           │              │
│   │                                             │              │
│   │   • Create video record (if first snapshot) │              │
│   │   • Find or create incident (by location)   │              │
│   └─────────────────────────────────────────────┘              │
│                         │                                       │
│                         ▼                                       │
│   ┌─────────────────────────────────────────────┐              │
│   │            Insert Snapshot Record           │              │
│   └─────────────────────────────────────────────┘              │
│                         │                                       │
│                         ▼                                       │
│   ┌─────────────────────────────────────────────┐              │
│   │         Add to Snapshot Buffer              │              │
│   │         (for batch processing)              │              │
│   └─────────────────────────────────────────────┘              │
│                         │                                       │
│                         ▼                                       │
│   ┌─────────────────────────────────────────────┐              │
│   │   Broadcast 'snapshotReceived' via SSE      │              │
│   └─────────────────────────────────────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Workflow 2: Incident Grouping

Videos are automatically grouped into incidents based on location and time.

```
┌─────────────────────────────────────────────────────────────────┐
│                    INCIDENT GROUPING                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   New Video Arrives                                             │
│   (lat: 37.7749, lng: -122.4194)                               │
│                         │                                       │
│                         ▼                                       │
│   ┌─────────────────────────────────────────────┐              │
│   │   Search for Active Incidents               │              │
│   │   • Within time window (default: 1 hour)    │              │
│   │   • Within radius (default: 50 meters)      │              │
│   └─────────────────────────────────────────────┘              │
│                         │                                       │
│            ┌────────────┴────────────┐                          │
│            │                         │                          │
│            ▼                         ▼                          │
│   ┌─────────────────┐       ┌─────────────────┐                │
│   │  Match Found    │       │  No Match       │                │
│   │                 │       │                 │                │
│   │  Assign video   │       │  Create new     │                │
│   │  to existing    │       │  incident at    │                │
│   │  incident       │       │  this location  │                │
│   └─────────────────┘       └─────────────────┘                │
│                                                                 │
│   Distance Calculation: Haversine Formula                       │
│   √((lat2-lat1)² + (lng2-lng1)²) adjusted for Earth curvature  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Workflow 3: AI Timeline Generation

The Snapshot Buffer batches snapshots and sends them to Gemini for analysis.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SNAPSHOT BUFFER                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Configuration:                                                │
│   • Batch Window: 10 seconds                                    │
│   • Min Batch Size: 3 snapshots                                 │
│   • Max Batch Size: 10 snapshots                                │
│                                                                 │
│   ┌─────────────────────────────────────────────┐              │
│   │           Per-Incident Buffer               │              │
│   │                                             │              │
│   │   incident-123: [snap1, snap2, snap3, ...]  │              │
│   │   incident-456: [snap4, snap5, ...]         │              │
│   └─────────────────────────────────────────────┘              │
│                         │                                       │
│          Flush Conditions:                                      │
│          • Timer expires AND min size met                       │
│          • Max size reached (immediate flush)                   │
│                         │                                       │
│                         ▼                                       │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TIMELINE AGENT (GEMINI)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   1. Gather Context                                             │
│      • Recent 10 snapshots (conversation history)               │
│      • Current video state summary                              │
│      • New snapshots to analyze                                 │
│                                                                 │
│   2. Build Prompt                                               │
│      ┌─────────────────────────────────────────────┐           │
│      │ "You are analyzing emergency video feeds.   │           │
│      │  Here are the new observations:             │           │
│      │  [snapshot data]                            │           │
│      │                                             │           │
│      │  Previous context:                          │           │
│      │  [historical snapshots]                     │           │
│      │                                             │           │
│      │  Current state:                             │           │
│      │  [video.currentState]                       │           │
│      │                                             │           │
│      │  Generate timeline events for significant   │           │
│      │  state changes."                            │           │
│      └─────────────────────────────────────────────┘           │
│                                                                 │
│   3. Parse AI Response                                          │
│      {                                                          │
│        "events": [                                              │
│          {                                                      │
│            "description": "Person enters building",             │
│            "confidence": 0.92,                                  │
│            "fromState": { "location": "outside" },              │
│            "toState": { "location": "lobby" }                   │
│          }                                                      │
│        ],                                                       │
│        "updatedState": "Person now in building lobby"           │
│      }                                                          │
│                                                                 │
│   4. Store & Broadcast                                          │
│      • Insert TimelineEvent records                             │
│      • Update video.currentState                                │
│      • Broadcast via SSE: 'timelineEvent', 'stateUpdated'       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Workflow 4: Real-Time Broadcasting (SSE)

Server-Sent Events push updates to all connected dispatcher clients.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SSE MANAGER                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   GET /stream                                                   │
│        │                                                        │
│        ▼                                                        │
│   ┌─────────────────────────────────────────────┐              │
│   │         SSE Client Connection               │              │
│   │                                             │              │
│   │   • Client ID assigned                      │              │
│   │   • Response kept open                      │              │
│   │   • Heartbeat every 30 seconds              │              │
│   └─────────────────────────────────────────────┘              │
│                                                                 │
│   Event Broadcasting:                                           │
│                                                                 │
│   ┌─────────────────────────────────────────────┐              │
│   │  sseManager.broadcast('eventType', data)    │              │
│   │                                             │              │
│   │  Sends to ALL connected clients:            │              │
│   │  data: {"type":"eventType","payload":...}   │              │
│   └─────────────────────────────────────────────┘              │
│                                                                 │
│   Event Types:                                                  │
│   • connected        - Initial connection confirmation          │
│   • newVideo         - New video stream started                 │
│   • snapshotReceived - Raw snapshot received                    │
│   • timelineEvent    - AI-derived event created                 │
│   • stateUpdated     - Video state summary changed              │
│   • videoStatusChanged - Video ended or recording ready         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

### Health & Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server status with active connections |

### Incidents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/incidents` | List incidents (filterable by status) |
| GET | `/incidents/:id` | Get incident with videos and counts |
| GET | `/incidents/:id/timeline` | Get all timeline events for incident |
| GET | `/incidents/:id/snapshots` | Get raw snapshots for debugging |

### Videos

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/videos` | List videos (filterable by status, incident) |
| GET | `/videos/:id` | Get single video details |
| GET | `/videos/:id/timeline` | Get timeline events for video |
| PATCH | `/videos/:id` | Update status or recording URL |

### Snapshots

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/snapshots` | Submit new snapshot (auto-creates video/incident) |
| GET | `/snapshots` | List snapshots (filterable) |
| GET | `/snapshots/:id` | Get single snapshot |

### Real-Time

| Protocol | Endpoint | Description |
|----------|----------|-------------|
| SSE | `/stream` | Server-Sent Events broadcast |
| WebSocket | `/ws/snapshots` | Snapshot streaming |

---

## WebSocket Protocol

### Client → Server Messages

```typescript
// Initialize session
{
  "type": "init",
  "videoId": "camera-001",
  "lat": 37.7749,
  "lng": -122.4194
}

// Send snapshot
{
  "type": "snapshot",
  "scenario": "suspicious_activity",
  "data": {
    "confidence": 0.95,
    "description": "Person entering building"
  }
}
```

### Server → Client Messages

```typescript
// Acknowledgment
{
  "type": "ack",
  "snapshotId": "snap-123"
}
```

### Connection Lifecycle

1. Client connects to `/ws/snapshots`
2. Client sends `init` message with location
3. Server creates/finds video and incident
4. Client sends `snapshot` messages as they're detected
5. Server acknowledges each snapshot
6. On disconnect, server marks video as `ended`

---

## Services

### SSE Manager (`src/services/sse.ts`)

Singleton managing all SSE client connections.

```typescript
// Methods
addClient(id: string, res: Response)  // Register client
broadcast(event: string, data: any)   // Send to all clients
sendToClient(id, event, data)         // Send to specific client
getClientCount()                      // Active connections
```

### Snapshot Buffer (`src/services/snapshotBuffer.ts`)

Batches snapshots for efficient AI processing.

```typescript
// Configuration
BATCH_WINDOW_MS: 10000      // 10 seconds
MIN_BATCH_SIZE: 3           // Wait for at least 3
MAX_BATCH_SIZE: 10          // Flush at 10

// Methods
add(incidentId, snapshot)   // Add to buffer
flush()                     // Manually flush all
shutdown()                  // Graceful cleanup
```

### Timeline Agent (`src/services/timelineAgent.ts`)

Integrates with Google Gemini for AI analysis.

```typescript
// Process batch of snapshots
generateTimelineEvents(incidentId, snapshots)

// Returns
{
  events: TimelineEvent[],
  updatedState: string
}
```

### Incident Grouper (`src/services/incidentGrouper.ts`)

Handles automatic incident assignment.

```typescript
// Find or create incident for video location
findMatchingIncident(lat, lng, timestamp)

// Assign video to incident
assignVideoToIncident(videoId, incidentId)

// Atomic create and assign
ensureVideoWithIncident(videoId, lat, lng)
```

---

## Complete Request Flow Example

### Submitting a Snapshot

```
POST /snapshots
{
  "videoId": "camera-001",
  "lat": 37.7749,
  "lng": -122.4194,
  "type": "person_detected",
  "scenario": "suspicious_activity",
  "data": { "confidence": 0.95 }
}

                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Validate required fields                                     │
│ 2. ensureVideoWithIncident()                                    │
│    → Auto-creates video (if first snapshot)                     │
│    → Finds or creates incident based on location/time           │
│ 3. Insert snapshot record                                       │
│ 4. Add to snapshotBuffer for batching                          │
│ 5. Broadcast 'snapshotReceived' via SSE                        │
│ 6. Return response                                              │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
{
  "snapshotId": "snap-123",
  "incidentId": "incident-456",
  "videoId": "camera-001",
  "isNewVideo": true
}
```

---

## Environment Variables

### Required

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/db

# AI
GEMINI_API_KEY=your_gemini_api_key
```

### Optional (with defaults)

```bash
# Server
PORT=8080

# Database (Supabase IPv6 workaround)
DATABASE_POOLER_URL=

# Snapshot Batching
SNAPSHOT_BATCH_WINDOW_MS=10000
SNAPSHOT_BATCH_MIN_SIZE=3
SNAPSHOT_BATCH_MAX_SIZE=10

# Incident Grouping
INCIDENT_TIME_WINDOW_HOURS=1
INCIDENT_RADIUS_METERS=50
```

---

## Integration with Frontend

### Data Flow Summary

```
Frontend (Caller)          Backend                  Frontend (Dispatcher)
      │                       │                            │
      │  WebSocket Init       │                            │
      ├──────────────────────►│                            │
      │                       │      SSE: newVideo         │
      │                       ├───────────────────────────►│
      │                       │                            │
      │  WebSocket Snapshot   │                            │
      ├──────────────────────►│                            │
      │                       │      SSE: snapshotReceived │
      │                       ├───────────────────────────►│
      │                       │                            │
      │                       │  (Buffer flushes)          │
      │                       │  (Gemini processes)        │
      │                       │                            │
      │                       │      SSE: timelineEvent    │
      │                       ├───────────────────────────►│
      │                       │      SSE: stateUpdated     │
      │                       ├───────────────────────────►│
      │                       │                            │
      │  Disconnect           │                            │
      ├──────────────────────►│                            │
      │                       │      SSE: videoStatusChanged│
      │                       ├───────────────────────────►│
```

### LiveKit Integration

The backend does not handle LiveKit video streaming directly. LiveKit operates peer-to-peer between the caller frontend and dispatcher frontend, with token generation handled by the frontend's API route (`/api/livekit/token`).
