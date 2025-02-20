import { logger } from '../lib/logger';
import { randomUUID } from 'crypto';

interface CacheLogContext {
  operationId: string;
  operation: 'get' | 'set' | 'delete' | 'clear';
  key: string;
  duration: number;
  result: 'hit' | 'miss' | 'success' | 'error';
  size?: number;
  ttl?: number;
  timestamp: string;
  metadata?: any;
}

export const createCacheLogger = () => {
  return {
    logCacheOperation: (operation: 'get' | 'set' | 'delete' | 'clear', key: string) => {
      const operationId = randomUUID();
      const startTime = logger.startTimer();

      return {
        operationId,
        hit: (value: any) => {
          const duration = logger.endTimer(startTime);
          
          const context: CacheLogContext = {
            operationId,
            operation,
            key,
            duration,
            result: 'hit',
            size: Buffer.byteLength(JSON.stringify(value)),
            timestamp: new Date().toISOString()
          };

          logger.debug('Cache hit', {
            ...context,
            component: 'cache',
            action: 'cache_hit'
          });

          return value;
        },
        miss: () => {
          const duration = logger.endTimer(startTime);
          
          const context: CacheLogContext = {
            operationId,
            operation,
            key,
            duration,
            result: 'miss',
            timestamp: new Date().toISOString()
          };

          logger.debug('Cache miss', {
            ...context,
            component: 'cache',
            action: 'cache_miss'
          });
        },
        success: (metadata?: any) => {
          const duration = logger.endTimer(startTime);
          
          const context: CacheLogContext = {
            operationId,
            operation,
            key,
            duration,
            result: 'success',
            timestamp: new Date().toISOString(),
            metadata
          };

          logger.debug('Cache operation successful', {
            ...context,
            component: 'cache',
            action: 'cache_operation_success'
          });
        },
        error: (error: Error) => {
          const duration = logger.endTimer(startTime);
          
          const context: CacheLogContext = {
            operationId,
            operation,
            key,
            duration,
            result: 'error',
            timestamp: new Date().toISOString()
          };

          logger.error('Cache operation failed', error, {
            ...context,
            component: 'cache',
            action: 'cache_operation_failed'
          });
        }
      };
    }
  };
};

// Create a wrapper for NodeCache with logging
export const createLoggingCache = (cache: any) => {
  const cacheLogger = createCacheLogger();

  return {
    get: (key: string) => {
      const logger = cacheLogger.logCacheOperation('get', key);
      const value = cache.get(key);
      
      if (value === undefined) {
        logger.miss();
        return undefined;
      }
      
      return logger.hit(value);
    },

    set: (key: string, value: any, ttl?: number) => {
      const logger = cacheLogger.logCacheOperation('set', key);
      
      try {
        cache.set(key, value, ttl);
        logger.success({ ttl });
      } catch (error: any) {
        logger.error(error);
        throw error;
      }
    },

    delete: (key: string) => {
      const logger = cacheLogger.logCacheOperation('delete', key);
      
      try {
        const success = cache.del(key);
        logger.success({ existed: success });
        return success;
      } catch (error: any) {
        logger.error(error);
        throw error;
      }
    },

    clear: () => {
      const logger = cacheLogger.logCacheOperation('clear', '*');
      
      try {
        cache.clear();
        logger.success();
      } catch (error: any) {
        logger.error(error);
        throw error;
      }
    }
  };
};
