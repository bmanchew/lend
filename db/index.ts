<<<<<<< HEAD
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle, NeonDatabase } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
=======

import pkg from 'pg';
const { Pool } = pkg;
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set');
}

<<<<<<< HEAD
// Create pool with retry logic
const createPool = async (retryCount = 0) => {
  console.log(`[Database] Attempting to create pool (attempt ${retryCount + 1}/${MAX_RETRIES})`);
  try {
    const pool = new Pool(POOL_CONFIG);
    console.log('[Database] Pool created, testing connection...');

    // Test the connection
    await pool.query('SELECT 1');
    console.log('[Database] Connection test successful');
    return pool;
  } catch (error) {
    console.error('[Database] Connection error:', error);
    if (retryCount < MAX_RETRIES) {
      console.log(`[Database] Retrying connection in ${RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return createPool(retryCount + 1);
    }
    throw error;
  }
};

class DatabaseInstance {
  private static instance: DatabaseInstance;
  public pool?: Pool;
  public db?: NeonDatabase<typeof schema>;
  private initialized = false;
  private initializationPromise?: Promise<void>;

  private constructor() {
    console.log('[Database] Creating DatabaseInstance singleton');
=======
const connectionString = process.env.DATABASE_URL;

// Create postgres client
const client = postgres(connectionString, {
  max: 20,
  idle_timeout: 30,
  connect_timeout: 5,
  prepare: false
});

const db = drizzle(client, { schema });

// Health check function
const checkConnection = async () => {
  try {
    await client.query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
  }

<<<<<<< HEAD
  public static getInstance(): DatabaseInstance {
    if (!DatabaseInstance.instance) {
      console.log('[Database] Initializing new DatabaseInstance singleton');
      DatabaseInstance.instance = new DatabaseInstance();
    }
    return DatabaseInstance.instance;
=======
// Graceful shutdown
const cleanup = async () => {
  try {
    await client.end();
    console.log('Database connections closed');
  } catch (error) {
    console.error('Error during database cleanup:', error);
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
  }

  public async initialize(): Promise<void> {
    if (this.initializationPromise) {
      console.log('[Database] Initialization already in progress, waiting...');
      return this.initializationPromise;
    }

<<<<<<< HEAD
    if (this.initialized) {
      console.log('[Database] Already initialized');
      return;
    }

    console.log('[Database] Starting initialization');
    this.initializationPromise = (async () => {
      try {
        this.pool = await createPool();
        console.log('[Database] Pool created successfully');

        this.db = drizzle(this.pool, { schema });
        console.log('[Database] Drizzle ORM initialized');

        this.initialized = true;
        console.log('[Database] Initialization completed successfully');
      } catch (error) {
        console.error('[Database] Initialization failed:', error);
        throw error;
      } finally {
        this.initializationPromise = undefined;
      }
    })();

    return this.initializationPromise;
  }

  public async checkConnection(): Promise<boolean> {
    if (!this.pool) {
      console.log('[Database] No pool available for health check');
      return false;
    }
    try {
      console.log('[Database] Performing health check...');
      await this.pool.query('SELECT 1');
      console.log('[Database] Health check passed');
      return true;
    } catch (error) {
      console.error('[Database] Health check failed:', error);
      return false;
    }
  }

  public async cleanup(): Promise<void> {
    if (this.pool) {
      console.log('[Database] Starting cleanup...');
      try {
        await this.pool.end();
        console.log('[Database] Cleanup completed, all connections closed');
      } catch (error) {
        console.error('[Database] Cleanup failed:', error);
      }
    } else {
      console.log('[Database] No pool to clean up');
    }
  }

  private async handlePoolError(err: Error): Promise<void> {
    console.error('[Database] Unexpected error:', err);
    try {
      console.log('[Database] Attempting to reconnect...');
      const newPool = await createPool();
      if (newPool) {
        this.pool = newPool;
        this.db = drizzle(newPool, { schema });
        console.log('[Database] Successfully reconnected');
      }
    } catch (reconnectError) {
      console.error('[Database] Reconnection failed:', reconnectError);
    }
  }

  public isInitialized(): boolean {
    return this.initialized;
  }
}

// Create and initialize the database instance
const dbInstance = DatabaseInstance.getInstance();

// Set up cleanup handlers
process.on('SIGTERM', () => {
  console.log('[Database] Received SIGTERM signal');
  dbInstance.cleanup();
});
process.on('SIGINT', () => {
  console.log('[Database] Received SIGINT signal');
  dbInstance.cleanup();
});

// Initialize the database connection
console.log('[Database] Starting initial database connection');
await dbInstance.initialize().catch(error => {
  console.error('[Database] Failed to initialize database:', error);
  process.exit(1);
});

// Export the singleton instance and its db property with proper typing
export { dbInstance };
export const db = new Proxy({} as NeonDatabase<typeof schema>, {
  get: (target, prop: string | symbol) => {
    if (!dbInstance.db) {
      console.error('[Database] Attempted to access database before initialization');
      throw new Error('Database not initialized');
    }
    return dbInstance.db[prop as keyof typeof dbInstance.db];
  },
});

export const checkConnection = () => dbInstance.checkConnection();
=======
export { db, checkConnection };
>>>>>>> 5f3313f344debc3d201818f060b5e618febf5116
