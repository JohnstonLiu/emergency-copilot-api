# Emergency Copilot - Complete Project Documentation

## Overview

Emergency Copilot is a real-time emergency response platform that uses AI-powered video analysis to detect emergencies and coordinate dispatcher response. The system consists of two main components:

- **emergency-copilot** (Frontend): Next.js 16 application with caller video capture and dispatcher dashboard
- **emergency-copilot-api** (Backend): Express.js API with PostgreSQL, real-time communication, and Gemini AI integration

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EMERGENCY COPILOT SYSTEM                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────┐      ┌───────────────────────────────┐  │
│  │     emergency-copilot         │      │    emergency-copilot-api      │  │
│  │        (Frontend)             │      │        (Backend)              │  │
│  │                               │      │                               │  │
│  │  Routes:                      │      │  Services:                    │  │
│  │  • / (Caller/Signal)          │      │  • REST API (/incidents,      │  │
│  │  • /dispatcher (Dashboard)    │◄────►│    /videos, /snapshots)       │  │
│  │  • /map (Location Test)       │      │  • WebSocket (/ws/snapshots)  │  │
│  │                               │ HTTP │  • SSE (/stream)              │  │
│  │  Tech Stack:                  │  WS  │                               │  │
│  │  • Next.js 16 + React 19      │ SSE  │  Tech Stack:                  │  │
│  │  • LiveKit (video streaming)  │      │  • Bun + Express.js           │  │
│  │  • Overshoot SDK (AI vision)  │      │  • PostgreSQL + Drizzle ORM   │  │
│  │  • Leaflet (maps)             │      │  • Google Gemini AI           │  │
│  │  • TypeScript                 │      │  • TypeScript                 │  │
│  └───────────────────────────────┘      └───────────────────────────────┘  │
│                                                    │                        │
│                                                    ▼                        │
│                                         ┌───────────────────┐              │
│                                         │    PostgreSQL     │              │
│                                         │                   │              │
│                                         │  • incidents      │              │
│                                         │  • videos         │              │
│                                         │  • snapshots      │              │
│                                         │  • timeline_events│              │
│                                         └───────────────────┘              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### Complete Request Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CALLER FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. UPLOAD & DETECT                                                         │
│     Caller uploads video → Overshoot SDK analyzes for threats               │
│     (weapons, violence, accidents, fire, medical emergencies)               │
│                                                                             │
│  2. SIGNAL THRESHOLD (3 signals)                                            │
│     After 3 anomaly detections → System activates streaming mode            │
│                                                                             │
│  3. INCIDENT CREATION                                                       │
│     WebSocket connects → init(videoId, lat, lng)                            │
│     Backend creates/assigns incident (groups by location within 50m)        │
│                                                                             │
│  4. LIVE STREAMING                                                          │
│     • LiveKit publishes video to room                                       │
│     • Overshoot continues scene analysis                                    │
│     • Snapshots sent via WebSocket every ~1 second                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            BACKEND FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  5. SNAPSHOT BUFFERING                                                      │
│     Snapshots accumulated per incident (3-10 per 10-second window)          │
│                                                                             │
│  6. AI PROCESSING                                                           │
│     Batch sent to Gemini 2.5-flash → Generates timeline events              │
│     AI identifies STATE CHANGES (not static descriptions)                   │
│     Updates video's currentState summary                                    │
│                                                                             │
│  7. REAL-TIME BROADCAST                                                     │
│     SSE pushes events to all connected dispatcher clients:                  │
│     • newVideo, snapshotReceived, timelineEvent, stateUpdated               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          DISPATCHER FLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  8. DASHBOARD MONITORING                                                    │
│     • SSE connection receives real-time events                              │
│     • Map shows incidents/videos with live markers                          │
│     • Detail panels show timeline and video streams                         │
│     • LiveKit subscribes to video rooms for live playback                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

### Frontend (emergency-copilot)

```
emergency-copilot/
├── app/                              # Next.js 16 App Router
│   ├── api/livekit/token/            # LiveKit token generation API
│   │   └── route.ts                  # POST endpoint for room tokens
│   ├── dispatcher/                   # Dispatcher dashboard
│   │   └── page.tsx                  # Real-time incident monitoring
│   ├── map/                          # Location testing page
│   │   └── page.tsx                  # Geolocation with Leaflet
│   ├── test/                         # Development test pages
│   ├── test-caller/                  # LiveKit caller testing
│   ├── test-livekit/                 # LiveKit connection testing
│   ├── layout.tsx                    # Root layout
│   └── page.tsx                      # Main caller/signal detection page
├── components/                       # Reusable React components
│   ├── dispatcher/                   # Dispatcher-specific components
│   │   ├── IncidentDetailsPanel.tsx  # Incident info panel
│   │   ├── VideoDetailsPanel.tsx     # Video info and stream panel
│   │   ├── IncidentCard.tsx          # Incident list item
│   │   ├── VideoCard.tsx             # Video list item
│   │   ├── VideoStreamPanel.tsx      # LiveKit video player
│   │   ├── TimelinePlayback.tsx      # Timeline event visualization
│   │   └── FilterPanel.tsx           # Scenario filtering
│   ├── MapView.tsx                   # Basic Leaflet map
│   ├── DispatcherMapView.tsx         # Map with incident/video markers
│   └── AlertMessage.tsx              # Alert notifications
├── hooks/                            # Custom React hooks
│   ├── useSignalDetection.ts         # Overshoot anomaly detection
│   ├── useSnapshotWebSocket.ts       # WebSocket for snapshot streaming
│   ├── useDescriptionVision.ts       # Overshoot scene description
│   ├── useOvershootVision.ts         # Low-level Overshoot wrapper
│   ├── useSSE.ts                     # Server-Sent Events connection
│   ├── useLocation.ts                # Browser geolocation
│   ├── useCallerFilters.ts           # Scenario filtering
│   └── usePlayback.ts                # Timeline playback
├── lib/                              # Utility functions
│   └── api.ts                        # REST API client functions
├── types/                            # TypeScript type definitions
│   ├── api.ts                        # API response types
│   ├── signal.ts                     # Signal detection types
│   └── event.ts                      # Event types
├── public/                           # Static assets
├── package.json                      # Dependencies
├── tsconfig.json                     # TypeScript config
├── next.config.ts                    # Next.js config
└── .env                              # Environment variables
```

### Backend (emergency-copilot-api)

```
emergency-copilot-api/
├── src/
│   ├── config/                       # Configuration
│   │   ├── env.ts                    # Environment variable loading
│   │   ├── db.ts                     # PostgreSQL connection (Drizzle)
│   │   └── http.ts                   # HTTP status codes
│   ├── middleware/                   # Express middleware
│   │   ├── logger.ts                 # Request/response logging
│   │   └── catchErrors.ts            # Error handler wrapper
│   ├── models/                       # Database schema
│   │   └── index.ts                  # Drizzle ORM table definitions
│   ├── routes/                       # API endpoints
│   │   ├── incidents.ts              # Incident CRUD + timeline
│   │   ├── videos.ts                 # Video CRUD + status
│   │   └── snapshots.ts              # Snapshot submission
│   ├── services/                     # Business logic
│   │   ├── sse.ts                    # SSE client management
│   │   ├── snapshotBuffer.ts         # Batch accumulation
│   │   ├── timelineAgent.ts          # Gemini AI processing
│   │   ├── incidentGrouper.ts        # Location-based grouping
│   │   └── snapshotWebSocket.ts      # WebSocket session management
│   ├── utils/                        # Utilities
│   │   └── geo.ts                    # Haversine distance calculations
│   └── main.ts                       # Express app entry point
├── drizzle/                          # Database migrations
├── docs/                             # Client integration guides
│   ├── NEXTJS_CLIENT.md              # Caller client guide
│   └── DASHBOARD_CLIENT.md           # Dashboard client guide
├── package.json                      # Dependencies
├── tsconfig.json                     # TypeScript config
├── drizzle.config.ts                 # Drizzle ORM config
├── README.md                         # Setup guide
├── API.md                            # API endpoint documentation
├── DATABASE.md                       # Database setup guide
├── SSE_USAGE.md                      # SSE infrastructure guide
└── OVERSHOOT_API.md                  # Overshoot SDK documentation
```

---

## Database Schema

### Tables

#### incidents
Represents grouped emergency events at a location.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| status | VARCHAR | 'active', 'resolved', 'archived' |
| lat | REAL | Latitude |
| lng | REAL | Longitude |
| startedAt | TIMESTAMP | When first video started |
| createdAt | TIMESTAMP | Record creation time |
| updatedAt | TIMESTAMP | Last update time |

#### videos
Individual video streams (many videos can belong to one incident).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| incidentId | UUID | Foreign key to incidents (nullable) |
| status | VARCHAR | 'live', 'ended', 'recorded' |
| currentState | TEXT | AI-generated human-readable summary |
| videoUrl | VARCHAR | URL to recorded video (nullable) |
| lat | REAL | Latitude |
| lng | REAL | Longitude |
| startedAt | TIMESTAMP | Stream start time |
| endedAt | TIMESTAMP | Stream end time (nullable) |
| createdAt | TIMESTAMP | Record creation time |
| updatedAt | TIMESTAMP | Last update time |

#### snapshots
Raw observations from Overshoot video analysis.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| videoId | UUID | Foreign key to videos (cascade delete) |
| timestamp | TIMESTAMP | When observation occurred |
| lat | REAL | Latitude |
| lng | REAL | Longitude |
| type | VARCHAR | Snapshot type (e.g., 'overshoot_analysis') |
| scenario | VARCHAR | Classification (vehicle_accident, fire, etc.) |
| data | JSONB | Structured analysis data |
| createdAt | TIMESTAMP | Record creation time |
| updatedAt | TIMESTAMP | Last update time |

#### timeline_events
AI-derived meaningful events (state changes).

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| videoId | UUID | Foreign key to videos (cascade delete) |
| timestamp | TIMESTAMP | When event occurred |
| description | TEXT | Human-readable event description |
| fromState | JSONB | Previous state context |
| toState | JSONB | New state context |
| confidence | REAL | AI confidence score (0-1) |
| sourceSnapshots | JSONB | Array of snapshot IDs used |
| createdAt | TIMESTAMP | Record creation time |

### Relationships

```
incidents (1) ──────────< videos (many)
                              │
                              ├──────< snapshots (many)
                              │
                              └──────< timeline_events (many)
```

---

## API Endpoints

### REST Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Server status, SSE/WS client counts |
| GET | /incidents | List incidents (filter by status) |
| GET | /incidents/:id | Get incident with videos and counts |
| GET | /incidents/:id/timeline | Get timeline events for incident |
| GET | /incidents/:id/snapshots | Get raw snapshots (debug) |
| GET | /videos | List videos (filter by status/incidentId) |
| GET | /videos/:id | Get video details |
| GET | /videos/:id/timeline | Get timeline for specific video |
| PATCH | /videos/:id | Update status or videoUrl |
| POST | /snapshots | Submit snapshot (auto-creates video/incident) |
| GET | /snapshots | List snapshots |
| GET | /snapshots/:id | Get specific snapshot |

### WebSocket

**Endpoint:** `WS /ws/snapshots`

Messages:
- `init` (client → server): Start session with videoId, lat, lng
- `initialized` (server → client): Returns incidentId
- `snapshot` (client → server): Send Overshoot analysis result
- `snapshot_ack` (server → client): Confirms snapshot received
- `error` (server → client): Error messages

### SSE (Server-Sent Events)

**Endpoint:** `GET /stream?clientId=<optional>`

Events:
- `connected`: Connection established
- `newVideo`: New video stream started
- `snapshotReceived`: New snapshot received
- `timelineEvent`: AI-generated timeline event
- `stateUpdated`: Video state summary updated
- `videoStatusChanged`: Video status changed (ended/recorded)

---

## Key Features

### 1. AI-Powered Anomaly Detection
- Uses Overshoot SDK for real-time video analysis
- Detects threats: weapons, violence, accidents, fire, medical emergencies
- Signal threshold (3 detections) triggers streaming mode
- Configurable sensitivity and cooldown

### 2. Automatic Incident Grouping
- Videos within ~50 meters grouped into same incident
- Time window grouping (1 hour default)
- Haversine distance calculation for accuracy

### 3. Real-Time Video Streaming
- LiveKit WebRTC for low-latency video
- Caller publishes, dispatcher subscribes
- Token-based room authentication

### 4. AI Timeline Generation
- Gemini 2.5-flash processes snapshot batches
- Identifies STATE CHANGES (not static descriptions)
- Generates human-readable timeline events
- Confidence scores for each event

### 5. Real-Time Dashboard Updates
- SSE pushes all events to connected clients
- Live map markers with pulse animations
- Collapsible incident/video panels
- Timeline visualization

---

## Environment Variables

### Frontend (.env)

```env
# Overshoot AI Vision
NEXT_PUBLIC_OVERSHOOT_API_KEY=ovs_your_key_here

# LiveKit Video Streaming
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret

# Backend API
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### Backend (.env)

```env
# Server
PORT=8080

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/emergency_copilot
DATABASE_POOLER_URL=  # Optional: For Supabase IPv6 workaround

# AI
GEMINI_API_KEY=your_gemini_api_key

# Snapshot Processing
SNAPSHOT_BATCH_WINDOW_MS=10000      # 10 seconds
SNAPSHOT_BATCH_MIN_SIZE=3           # Minimum snapshots per batch
SNAPSHOT_BATCH_MAX_SIZE=10          # Maximum snapshots per batch

# Incident Grouping
INCIDENT_TIME_WINDOW_HOURS=1        # Group within 1 hour
INCIDENT_RADIUS_METERS=50           # Group within 50 meters
```

---

## Setup Instructions

### Prerequisites

- Node.js 18+ or Bun 1.3.4+
- PostgreSQL 14+
- Overshoot API key
- LiveKit account
- Google Gemini API key

### Backend Setup

```bash
cd emergency-copilot-api

# Install dependencies
bun install

# Create database
createdb emergency_copilot

# Set environment variables
cp .env.example .env
# Edit .env with your credentials

# Run migrations
bun run db:generate
bun run db:push

# Start server
bun run dev
```

### Frontend Setup

```bash
cd emergency-copilot

# Install dependencies
npm install  # or bun install

# Set environment variables
cp .env.example .env.local
# Edit .env.local with your credentials

# Start development server
npm run dev  # or bun dev
```

### Running the Full System

1. Start PostgreSQL
2. Start backend: `cd emergency-copilot-api && bun run dev`
3. Start frontend: `cd emergency-copilot && npm run dev`
4. Open http://localhost:3000 for caller interface
5. Open http://localhost:3000/dispatcher for dashboard

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.1.3 | React framework with App Router |
| React | 19.2.3 | UI library |
| TypeScript | 5.x | Type safety |
| LiveKit | 2.17.0 | WebRTC video streaming |
| Overshoot SDK | 0.1.0-alpha.2 | AI video analysis |
| Leaflet | 1.9.4 | Interactive maps |
| react-leaflet | 5.0.0 | React map wrapper |
| Tailwind CSS | 4.x | Styling |

### Backend
| Technology | Version | Purpose |
|------------|---------|---------|
| Bun | 1.3.4+ | JavaScript runtime |
| Express.js | 5.2.1 | Web framework |
| PostgreSQL | 14+ | Database |
| Drizzle ORM | 0.45.1 | Type-safe ORM |
| Google Generative AI | 0.24.1 | Gemini integration |
| ws | 8.19.0 | WebSocket server |

---

## Common Scenarios

### Scenario Values
Used in snapshots and detection:
- `vehicle_accident` - Car/vehicle collision
- `fire` - Fire or smoke detected
- `injury` / `medical` - Visible injury or medical emergency
- `weapon` - Weapon detected
- `person_down` - Person on ground
- `crowd` - Large gathering
- `scene_analysis` - General scene description
- `unknown` - Unclassified

### Video Status Lifecycle

```
┌────────┐    WebSocket     ┌────────┐    PATCH with    ┌──────────┐
│  live  │ ────────────────►│ ended  │ ───────────────► │ recorded │
└────────┘   disconnects    └────────┘    videoUrl      └──────────┘
```

### Incident Status Lifecycle

```
┌────────┐    Resolved     ┌──────────┐    Archived    ┌──────────┐
│ active │ ──────────────► │ resolved │ ─────────────► │ archived │
└────────┘                 └──────────┘                └──────────┘
```

---

## Testing

### Test Pages (Frontend)
- `/test` - General testing
- `/test-caller` - LiveKit caller simulation
- `/test-livekit` - LiveKit connection testing
- `/map` - Geolocation testing

### API Testing (Backend)

```bash
# Health check
curl http://localhost:8080/health

# List incidents
curl http://localhost:8080/incidents?status=active

# SSE connection test
curl -N http://localhost:8080/stream

# WebSocket test (use wscat)
wscat -c ws://localhost:8080/ws/snapshots
```

---

## Key Files Reference

### Critical Frontend Files
- `app/page.tsx` - Main caller/signal detection logic
- `app/dispatcher/page.tsx` - Dispatcher dashboard
- `hooks/useSignalDetection.ts` - Anomaly detection hook
- `hooks/useSnapshotWebSocket.ts` - WebSocket communication
- `hooks/useSSE.ts` - SSE connection hook
- `lib/api.ts` - REST API client

### Critical Backend Files
- `src/main.ts` - Express app entry point
- `src/models/index.ts` - Database schema
- `src/services/timelineAgent.ts` - Gemini AI processing
- `src/services/snapshotBuffer.ts` - Batch accumulation
- `src/services/incidentGrouper.ts` - Location grouping
- `src/services/sse.ts` - SSE broadcasting
- `src/services/snapshotWebSocket.ts` - WebSocket handling

---

## Documentation Index

### Backend Documentation
- [API.md](emergency-copilot-api/API.md) - Full API endpoint reference
- [DATABASE.md](emergency-copilot-api/DATABASE.md) - Database setup and schema
- [SSE_USAGE.md](emergency-copilot-api/SSE_USAGE.md) - SSE infrastructure guide
- [OVERSHOOT_API.md](emergency-copilot-api/OVERSHOOT_API.md) - Overshoot SDK documentation
- [docs/NEXTJS_CLIENT.md](emergency-copilot-api/docs/NEXTJS_CLIENT.md) - Caller client integration
- [docs/DASHBOARD_CLIENT.md](emergency-copilot-api/docs/DASHBOARD_CLIENT.md) - Dashboard client integration
