import { logger } from '../lib/logger';
import { randomUUID } from 'crypto';

// Interface for database query context
interface DBQueryContext {
  queryId: string;
  operation: string;
  table: string;
  duration: number;
  timestamp: string;
  rowCount?: number;
  parameters?: any;
}

// Database logging middleware
export const createDBLogger = () => {
  return {
    // Log database queries
    logQuery: (sql: string, params: any[] = []) => {
      const queryId = randomUUID();
      const startTime = logger.startTimer();
      
      return {
        queryId,
        // Called after query execution
        complete: (result: any) => {
          const duration = logger.endTimer(startTime);
          
          const context: DBQueryContext = {
            queryId,
            operation: sql.split(' ')[0].toUpperCase(),
            table: extractTableName(sql),
            duration,
            timestamp: new Date().toISOString(),
            parameters: params,
            rowCount: result?.rowCount
          };

          logger.info('Database query completed', {
            ...context,
            component: 'database',
            action: 'query_executed'
          });

          return result;
        },
        // Called if query fails
        error: (error: Error) => {
          const duration = logger.endTimer(startTime);
          
          logger.error('Database query failed', error, {
            queryId,
            operation: sql.split(' ')[0].toUpperCase(),
            table: extractTableName(sql),
            duration,
            timestamp: new Date().toISOString(),
            parameters: params,
            component: 'database',
            action: 'query_failed'
          });

          throw error;
        }
      };
    },

    // Log database transactions
    logTransaction: () => {
      const transactionId = randomUUID();
      const startTime = logger.startTimer();

      return {
        transactionId,
        // Called when transaction commits
        commit: () => {
          const duration = logger.endTimer(startTime);
          
          logger.info('Database transaction committed', {
            transactionId,
            duration,
            timestamp: new Date().toISOString(),
            component: 'database',
            action: 'transaction_committed'
          });
        },
        // Called when transaction rolls back
        rollback: (error: Error) => {
          const duration = logger.endTimer(startTime);
          
          logger.error('Database transaction rolled back', error, {
            transactionId,
            duration,
            timestamp: new Date().toISOString(),
            component: 'database',
            action: 'transaction_rollback'
          });
        }
      };
    }
  };
};

// Helper function to extract table name from SQL query
function extractTableName(sql: string): string {
  const fromMatch = sql.match(/FROM\s+(\w+)/i);
  const insertMatch = sql.match(/INTO\s+(\w+)/i);
  const updateMatch = sql.match(/UPDATE\s+(\w+)/i);
  const deleteMatch = sql.match(/FROM\s+(\w+)/i);
  
  return (fromMatch?.[1] || insertMatch?.[1] || updateMatch?.[1] || deleteMatch?.[1] || 'unknown_table');
}
