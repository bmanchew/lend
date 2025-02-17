import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from './schema';

// Configure Neon with WebSocket
neonConfig.webSocketConstructor = ws;

// Connection configuration
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // 5 seconds
const POOL_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  max: 20, // Maximum pool size
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 5000, // Connection timeout after 5 seconds
  maxUses: 7500 // Close connection after this many queries
};

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set');
}

// Create pool with retry logic
const createPool = async (retryCount = 0) => {
  try {
    const pool = new Pool(POOL_CONFIG);

    // Test the connection
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

// Initialize db instance
let pool: Pool | undefined;
let db: ReturnType<typeof drizzle<typeof schema>>;

// Initialize pool and db
const initialize = async () => {
  if (!pool) {
    pool = await createPool();
    db = drizzle(pool, { schema });
  }
  return { pool, db };
};

// Health check function
const checkConnection = async () => {
  if (!pool) return false;
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
  if (!pool) return;
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
const handlePoolError = async (err: Error) => {
  console.error('Unexpected database error:', err);
  try {
    const newPool = await createPool();
    if (newPool) {
      pool = newPool;
      db = drizzle(newPool, { schema });
      console.log("Successfully reconnected to the database");
    }
  } catch (reconnectError) {
    console.error("Failed to reconnect to database", reconnectError);
  }
};

// Initialize the database connection
initialize().catch(error => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});

pool?.on('error', handlePoolError);

export { db, checkConnection };