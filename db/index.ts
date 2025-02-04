
import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

// Connection configuration
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // 5 seconds
const POOL_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  maxUses: 7500
};

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set');
}

// Create pool with retry logic
const createPool = async (retryCount = 0) => {
  try {
    const pool = new Pool(POOL_CONFIG);
    await pool.query('SELECT 1');
    console.log('Database connected successfully');
    return pool;
  } catch (error) {
    console.error('Database connection error:', error);
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying connection in ${RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return createPool(retryCount + 1);
    }
    throw error;
  }
};

// Initialize pool
const pool = await createPool();
const db = drizzle(pool, { schema });

// Health check function
const checkConnection = async () => {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
};

// Graceful shutdown
const cleanup = async () => {
  try {
    await pool.end();
    console.log('Database connections closed');
  } catch (error) {
    console.error('Error during database cleanup:', error);
  }
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

// Add error handling for unexpected disconnects
pool.on('error', async (err) => {
  console.error('Unexpected database error:', err);
  try {
    const newPool = await createPool();
    Object.assign(pool, newPool);
    Object.assign(db, drizzle(newPool, {schema}));
    console.log("Successfully reconnected to the database");
  } catch (reconnectError) {
    console.error("Failed to reconnect to database", reconnectError);
  }
});

export { db, checkConnection };
