import type { Config } from 'drizzle-kit';

// Use DATABASE_POOLER_URL for migrations if available (for Supabase IPv6 workaround)
// Otherwise fall back to DATABASE_URL
const connectionUrl = process.env.DATABASE_POOLER_URL 
  || process.env.DATABASE_URL 
  || 'postgresql://localhost:5432/emergency_copilot';

export default {
  schema: './src/models/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: connectionUrl,
  },
} satisfies Config;
