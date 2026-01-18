const getEnv = (key: string, defaultValue?: string): string => {
  const value = process.env[key] || defaultValue;

  if (value === undefined) {
    throw Error(`Missing String environment variable for ${key}`);
  }
  return value;
};

export const PORT = getEnv("PORT", "8080");
export const GEMINI_API_KEY = getEnv("GEMINI_API_KEY");
export const DATABASE_URL = getEnv("DATABASE_URL", "postgresql://localhost:5432/emergency_copilot");
// Use pooler URL for Supabase (IPv6 workaround) - falls back to DATABASE_URL
export const DATABASE_POOLER_URL = getEnv("DATABASE_POOLER_URL", DATABASE_URL);

// Snapshot batching configuration
export const SNAPSHOT_BATCH_WINDOW_MS = parseInt(getEnv("SNAPSHOT_BATCH_WINDOW_MS", "10000")); // 10 seconds
export const SNAPSHOT_BATCH_MIN_SIZE = parseInt(getEnv("SNAPSHOT_BATCH_MIN_SIZE", "3")); // Minimum before processing
export const SNAPSHOT_BATCH_MAX_SIZE = parseInt(getEnv("SNAPSHOT_BATCH_MAX_SIZE", "10")); // Max before immediate flush

// Incident grouping configuration
export const INCIDENT_TIME_WINDOW_HOURS = parseInt(getEnv("INCIDENT_TIME_WINDOW_HOURS", "1"));
export const INCIDENT_RADIUS_METERS = parseInt(getEnv("INCIDENT_RADIUS_METERS", "100"));