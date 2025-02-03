import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

const createDbConnection = async () => {
  let retries = 0;
  let lastError;
  while (retries < MAX_RETRIES) {
    try {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      await pool.query('SELECT 1'); // Test connection
      return {pool, db: drizzle({ client: pool, schema })};
    } catch (error) {
      console.error(`Database connection failed (attempt ${retries + 1}/${MAX_RETRIES}):`, error);
      retries++;
      if (retries < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }
  throw new Error(`Failed to connect to the database after ${MAX_RETRIES} retries.`);
};


let dbConnection;
const getDb = async () => {
  if (!dbConnection) {
    dbConnection = await createDbConnection();
  }
  return dbConnection.db;
};

export { getDb as db };


// Basic error handling and logging example.  This should be expanded upon for a production system.
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  // Add more robust error handling here, such as logging to a centralized system and graceful shutdown.
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  // Add more robust error handling here.
});