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

class DatabaseInstance {
  private static instance: DatabaseInstance;
  public pool?: Pool;
  public db?: ReturnType<typeof drizzle<typeof schema>>;
  private initialized = false;

  private constructor() {}

  public static getInstance(): DatabaseInstance {
    if (!DatabaseInstance.instance) {
      DatabaseInstance.instance = new DatabaseInstance();
    }
    return DatabaseInstance.instance;
  }

  public async initialize(): Promise<void> {
    if (!this.initialized) {
      this.pool = await createPool();
      this.db = drizzle(this.pool, { schema });
      this.initialized = true;
      console.log('Database instance initialized successfully');
    }
  }

  public async checkConnection(): Promise<boolean> {
    if (!this.pool) return false;
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }

  public async cleanup(): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.end();
        console.log('Database connections closed');
      } catch (error) {
        console.error('Error during database cleanup:', error);
      }
    }
  }

  private async handlePoolError(err: Error): Promise<void> {
    console.error('Unexpected database error:', err);
    try {
      const newPool = await createPool();
      if (newPool) {
        this.pool = newPool;
        this.db = drizzle(newPool, { schema });
        console.log("Successfully reconnected to the database");
      }
    } catch (reconnectError) {
      console.error("Failed to reconnect to database", reconnectError);
    }
  }
}

// Create and initialize the database instance
const dbInstance = DatabaseInstance.getInstance();

// Set up cleanup handlers
process.on('SIGTERM', () => dbInstance.cleanup());
process.on('SIGINT', () => dbInstance.cleanup());

// Initialize the database connection
dbInstance.initialize().catch(error => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});

// Export the singleton instance and its db property
export { dbInstance };
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get: (target, prop) => {
    if (!dbInstance.db) {
      throw new Error('Database not initialized');
    }
    return dbInstance.db[prop];
  },
});

export const checkConnection = () => dbInstance.checkConnection();