import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

const POOL_CONFIG = {
  connectionString: process.env.DATABASE_URL?.replace('postgres://', 'postgresql://'),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  maxUses: 7500
};

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set');
}

const pool = new Pool(POOL_CONFIG);
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

export { db, checkConnection };