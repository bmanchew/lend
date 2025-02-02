import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "./schema";
// Remove query cache as it's not needed for basic functionality

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });


// Basic error handling and logging example.  This should be expanded upon for a production system.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  // Add more robust error handling here, such as logging to a centralized system and graceful shutdown.
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  // Add more robust error handling here.
});