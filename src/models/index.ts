import { pgTable, uuid, varchar, timestamp, text, jsonb, real } from 'drizzle-orm/pg-core';
// Note: text is used for currentState (human-readable), jsonb for structured data like snapshot data
import { relations } from 'drizzle-orm';

export type EventScenario = string;
export type IncidentStatus = 'active' | 'resolved' | 'archived';
export type VideoStatus = 'live' | 'ended' | 'recorded';

// Incidents table - must be defined first for FK references
export const incidents = pgTable('incidents', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 50 }).$type<IncidentStatus>().default('active').notNull(),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Video table - many videos can belong to one incident
export const videos = pgTable('videos', {
  id: uuid('id').primaryKey().defaultRandom(),
  incidentId: uuid('incident_id').references(() => incidents.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 50 }).$type<VideoStatus>().default('live').notNull(),
  currentState: text('current_state'), // Human-readable AI summary of what's happening in this video
  videoUrl: varchar('video_url', { length: 512 }), // Nullable - set when recording is ready
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  startedAt: timestamp('started_at').notNull(),
  endedAt: timestamp('ended_at'), // When stream ended
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Snapshots table - raw observations from Overshoot
export const snapshots = pgTable('snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  videoId: uuid('video_id').notNull().references(() => videos.id, { onDelete: 'cascade' }),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  lat: real('lat').notNull(),
  lng: real('lng').notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  scenario: varchar('scenario', { length: 100 }).$type<EventScenario>().notNull(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Timeline Events table - AI-derived state changes
export const timelineEvents = pgTable('timeline_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  videoId: uuid('video_id').notNull().references(() => videos.id, { onDelete: 'cascade' }),
  timestamp: timestamp('timestamp').notNull(), // When the change occurred
  description: text('description').notNull(), // Human-readable: "Man enters building"
  fromState: jsonb('from_state'), // Previous state context
  toState: jsonb('to_state'), // New state context
  confidence: real('confidence'), // AI confidence score (0-1)
  sourceSnapshots: jsonb('source_snapshots'), // Array of snapshot IDs used to derive this
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const incidentsRelations = relations(incidents, ({ many }) => ({
  videos: many(videos),
}));

export const videosRelations = relations(videos, ({ one, many }) => ({
  incident: one(incidents, {
    fields: [videos.incidentId],
    references: [incidents.id],
  }),
  snapshots: many(snapshots),
  timelineEvents: many(timelineEvents),
}));

export const snapshotsRelations = relations(snapshots, ({ one }) => ({
  video: one(videos, {
    fields: [snapshots.videoId],
    references: [videos.id],
  }),
}));

export const timelineEventsRelations = relations(timelineEvents, ({ one }) => ({
  video: one(videos, {
    fields: [timelineEvents.videoId],
    references: [videos.id],
  }),
}));

// TypeScript types inferred from schema
export type Video = typeof videos.$inferSelect;
export type InsertVideo = typeof videos.$inferInsert;

export type Incident = typeof incidents.$inferSelect;
export type InsertIncident = typeof incidents.$inferInsert;

export type Snapshot = typeof snapshots.$inferSelect;
export type InsertSnapshot = typeof snapshots.$inferInsert;

export type TimelineEvent = typeof timelineEvents.$inferSelect;
export type InsertTimelineEvent = typeof timelineEvents.$inferInsert;
