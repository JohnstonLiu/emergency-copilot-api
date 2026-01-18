import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DATABASE_POOLER_URL } from './env';

// Create postgres connection using pooler URL
// Disable prefetch as it is not supported for "Transaction" pool mode
const client = postgres(DATABASE_POOLER_URL, { 
  prepare: false, 
  database: "postgres",
  ssl: "require"
});

// Create drizzle instance
export const db = drizzle(client);

// For graceful shutdown
export const closeDatabase = async () => {
  await client.end();
};
