# Database Setup Guide

## Overview

This API uses PostgreSQL with Drizzle ORM for database management.

## Prerequisites

- PostgreSQL installed and running
- Database created (e.g., `emergency_copilot`)

## Environment Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Update `DATABASE_URL` in `.env` with your PostgreSQL connection string:
   ```
   DATABASE_URL=postgresql://username:password@localhost:5432/emergency_copilot
   ```

## Database Schema

### Tables

#### `videos`
- `id` (UUID, Primary Key)
- `video_url` (VARCHAR)
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### `incidents`
- `id` (UUID, Primary Key)
- `timestamp` (Timestamp)
- `lat` (JSONB) - Latitude
- `lng` (JSONB) - Longitude
- `scenario` (VARCHAR) - Event scenario type
- `data` (JSONB) - Event-specific data
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

#### `snapshots`
- `id` (UUID, Primary Key)
- `video_id` (UUID, Foreign Key -> videos.id)
- `incident_id` (UUID, Foreign Key -> incidents.id, nullable)
- `timestamp` (Timestamp)
- `lat` (JSONB) - Latitude
- `lng` (JSONB) - Longitude
- `type` (VARCHAR) - Snapshot type
- `scenario` (VARCHAR) - Snapshot scenario
- `data` (JSONB) - Snapshot-specific data
- `created_at` (Timestamp)
- `updated_at` (Timestamp)

## Migration Commands

### Generate Migration Files
Creates SQL migration files based on schema changes:
```bash
bun run db:generate
```

### Apply Migrations
Run pending migrations against your database:
```bash
bun run db:migrate
```

### Push Schema (Development)
Push schema changes directly without migration files (for rapid development):
```bash
bun run db:push
```

### Drizzle Studio
Open visual database browser:
```bash
bun run db:studio
```

## Quick Start

1. Ensure PostgreSQL is running
2. Create database: `createdb emergency_copilot`
3. Set `DATABASE_URL` in `.env`
4. Generate and run migrations:
   ```bash
   bun run db:generate
   bun run db:push
   ```
5. Start the API:
   ```bash
   bun run dev
   ```

## Development Workflow

1. **Make schema changes** in `src/models/index.ts`
2. **Generate migrations**: `bun run db:generate`
3. **Review** generated SQL in `drizzle/` folder
4. **Apply migrations**: `bun run db:push` (dev) or `bun run db:migrate` (prod)

## Production Considerations

- Always use `db:migrate` instead of `db:push` in production
- Backup database before running migrations
- Test migrations in staging environment first
- Keep migration files in version control
