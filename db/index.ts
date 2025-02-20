import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle, NeonDatabase } from 'drizzle-orm/neon-serverless';
import ws from 'ws';
import * as schema from './schema';

// Configure Neon with WebSocket
neonConfig.webSocketConstructor = ws;

// Connection configuration
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 10000; // 10 seconds
const POOL_CONFIG = {
  connectionString: process.env.DATABASE_URL,
  max: process.env.NODE_ENV === 'production' ? 50 : 20, // Increased pool size for production
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 10000, // Increased connection timeout to 10 seconds
  maxUses: 10000, // Increased max uses before connection is closed
  keepAlive: true, // Enable keepalive
  keepAliveInitialDelayMillis: 10000 // Initial delay before first keepalive
};

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set');
}

// Enhanced createPool with exponential backoff
const createPool = async (retryCount = 0): Promise<Pool> => {
  const retryDelay = Math.min(INITIAL_RETRY_DELAY * Math.pow(2, retryCount), MAX_RETRY_DELAY);

  console.log(`[Database] Attempting to create pool (attempt ${retryCount + 1}/${MAX_RETRIES})`, {
    poolConfig: {
      ...POOL_CONFIG,
      connectionString: '[REDACTED]'
    },
    retryCount,
    retryDelay,
    timestamp: new Date().toISOString()
  });

  try {
    const pool = new Pool(POOL_CONFIG);

    // Set up error handler for the pool
    pool.on('error', (err: Error) => {
      console.error('[Database] Pool error:', {
        error: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
      });
    });

    console.log('[Database] Pool created, testing connection...');

    // Test the connection with timeout
    const connectionTest = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection test timed out'));
      }, POOL_CONFIG.connectionTimeoutMillis);

      pool.query('SELECT 1')
        .then(() => {
          clearTimeout(timeout);
          resolve();
        })
        .catch(reject);
    });

    await connectionTest;
    console.log('[Database] Connection test successful');
    return pool;
  } catch (error) {
    console.error('[Database] Connection error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      attempt: retryCount + 1,
      timestamp: new Date().toISOString()
    });

    if (retryCount < MAX_RETRIES - 1) {
      console.log(`[Database] Retrying connection in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      return createPool(retryCount + 1);
    }

    throw new Error(`Failed to create database pool after ${MAX_RETRIES} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

class DatabaseInstance {
  private static instance: DatabaseInstance;
  public pool?: Pool;
  public db?: NeonDatabase<typeof schema>;
  private initialized = false;
  private initializationPromise?: Promise<void>;
  private reconnectTimer?: NodeJS.Timeout;

  private constructor() {
    console.log('[Database] Creating DatabaseInstance singleton');
  }

  public static getInstance(): DatabaseInstance {
    if (!DatabaseInstance.instance) {
      console.log('[Database] Initializing new DatabaseInstance singleton');
      DatabaseInstance.instance = new DatabaseInstance();
    }
    return DatabaseInstance.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initializationPromise) {
      console.log('[Database] Initialization already in progress, waiting...');
      return this.initializationPromise;
    }

    if (this.initialized) {
      console.log('[Database] Already initialized');
      return;
    }

    console.log('[Database] Starting initialization');
    this.initializationPromise = (async () => {
      try {
        this.pool = await createPool();
        console.log('[Database] Pool created successfully');

        // Set up pool error handler
        this.pool.on('error', this.handlePoolError.bind(this));

        this.db = drizzle(this.pool, { schema });
        console.log('[Database] Drizzle ORM initialized');

        // Start periodic health checks
        this.startHealthChecks();

        this.initialized = true;
        console.log('[Database] Initialization completed successfully');
      } catch (error) {
        console.error('[Database] Initialization failed:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString()
        });
        throw error;
      } finally {
        this.initializationPromise = undefined;
      }
    })();

    return this.initializationPromise;
  }

  private startHealthChecks() {
    // Clear any existing health check timer
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
    }

    // Run health checks every 30 seconds
    this.reconnectTimer = setInterval(async () => {
      try {
        await this.checkConnection();
      } catch (error) {
        console.error('[Database] Health check failed:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
        await this.handlePoolError(error instanceof Error ? error : new Error('Health check failed'));
      }
    }, 30000);
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
      console.error('[Database] Health check failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      return false;
    }
  }

  public async cleanup(): Promise<void> {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.pool) {
      console.log('[Database] Starting cleanup...');
      try {
        await this.pool.end();
        console.log('[Database] Cleanup completed, all connections closed');
      } catch (error) {
        console.error('[Database] Cleanup failed:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        });
      }
    } else {
      console.log('[Database] No pool to clean up');
    }
  }

  private async handlePoolError(err: Error): Promise<void> {
    console.error('[Database] Pool error:', {
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    });

    try {
      // Attempt to clean up existing pool
      await this.cleanup();

      console.log('[Database] Attempting to reconnect...');
      const newPool = await createPool();
      if (newPool) {
        this.pool = newPool;
        this.db = drizzle(newPool, { schema });
        console.log('[Database] Successfully reconnected');

        // Restart health checks
        this.startHealthChecks();
      }
    } catch (reconnectError) {
      console.error('[Database] Reconnection failed:', {
        error: reconnectError instanceof Error ? reconnectError.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
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
  console.error('[Database] Failed to initialize database:', {
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    timestamp: new Date().toISOString()
  });
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