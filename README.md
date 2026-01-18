# Emergency Copilot API

A real-time emergency event tracking API with SSE (Server-Sent Events) support and PostgreSQL database.

## Prerequisites

- [Bun](https://bun.com) (v1.3.4 or later)
- PostgreSQL (v14 or later)

## Setup

### 1. Install Dependencies

```bash
bun install
```

### 2. Database Setup

Create a PostgreSQL database:

```bash
createdb emergency_copilot
```

### 3. Environment Variables

Create a `.env` file with the following variables:

```env
PORT=8080
GEMINI_API_KEY=your_gemini_api_key_here
OVERSHOOT_API_KEY=your_overshoot_api_key_here
DATABASE_URL=postgresql://username:password@localhost:5432/emergency_copilot
```

### 4. Database Migrations

Generate and push database schema:

```bash
bun run db:generate
bun run db:push
```

## Development

Run the development server with hot reload:

```bash
bun run dev
```

The server will start on `http://localhost:8080` (or the port specified in `.env`).

## Available Scripts

- `bun run dev` - Start development server with hot reload
- `bun run db:generate` - Generate database migration files
- `bun run db:migrate` - Run pending migrations
- `bun run db:push` - Push schema changes directly (dev only)
- `bun run db:studio` - Open Drizzle Studio (visual database browser)

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Snapshots
- `GET /snapshots/stream` - SSE endpoint for real-time snapshot updates
- `POST /snapshots` - Create a new snapshot

### Incidents
- `GET /incidents` - List all incidents
- `GET /timeline/:incidentId` - Get snapshot timeline for a specific incident

## Documentation

- [SSE Usage Guide](./SSE_USAGE.md)
- [Database Setup](./DATABASE.md)
