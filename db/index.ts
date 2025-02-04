
import pkg from 'pg';
const { Pool } = pkg;
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set');
}

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
  }
};

// Graceful shutdown
const cleanup = async () => {
  try {
    await client.end();
    console.log('Database connections closed');
  } catch (error) {
    console.error('Error during database cleanup:', error);
  }
};

process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

export { db, checkConnection };
