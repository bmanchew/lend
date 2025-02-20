import { logger } from '../lib/logger';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

// Interface for file operation context
interface FileOperationContext {
  operationId: string;
  operation: 'read' | 'write' | 'delete' | 'move';
  path: string;
  size?: number;
  duration: number;
  timestamp: string;
  metadata?: any;
}

export const createFileLogger = () => {
  return {
    // Log file read operations
    logFileRead: (filePath: string) => {
      const operationId = randomUUID();
      const startTime = logger.startTimer();

      return {
        operationId,
        complete: (data: Buffer) => {
          const duration = logger.endTimer(startTime);
          
          const context: FileOperationContext = {
            operationId,
            operation: 'read',
            path: filePath,
            size: data.length,
            duration,
            timestamp: new Date().toISOString(),
            metadata: {
              extension: path.extname(filePath),
              directory: path.dirname(filePath)
            }
          };

          logger.info('File read completed', {
            ...context,
            component: 'filesystem',
            action: 'file_read'
          });

          return data;
        },
        error: (error: Error) => {
          const duration = logger.endTimer(startTime);
          
          logger.error('File read failed', error, {
            operationId,
            operation: 'read',
            path: filePath,
            duration,
            timestamp: new Date().toISOString(),
            component: 'filesystem',
            action: 'file_read_failed'
          });

          throw error;
        }
      };
    },

    // Log file write operations
    logFileWrite: (filePath: string, data: Buffer | string) => {
      const operationId = randomUUID();
      const startTime = logger.startTimer();

      return {
        operationId,
        complete: () => {
          const duration = logger.endTimer(startTime);
          
          const context: FileOperationContext = {
            operationId,
            operation: 'write',
            path: filePath,
            size: Buffer.byteLength(data),
            duration,
            timestamp: new Date().toISOString(),
            metadata: {
              extension: path.extname(filePath),
              directory: path.dirname(filePath)
            }
          };

          logger.info('File write completed', {
            ...context,
            component: 'filesystem',
            action: 'file_write'
          });
        },
        error: (error: Error) => {
          const duration = logger.endTimer(startTime);
          
          logger.error('File write failed', error, {
            operationId,
            operation: 'write',
            path: filePath,
            size: Buffer.byteLength(data),
            duration,
            timestamp: new Date().toISOString(),
            component: 'filesystem',
            action: 'file_write_failed'
          });

          throw error;
        }
      };
    },

    // Log file deletion operations
    logFileDelete: (filePath: string) => {
      const operationId = randomUUID();
      const startTime = logger.startTimer();

      return {
        operationId,
        complete: () => {
          const duration = logger.endTimer(startTime);
          
          const context: FileOperationContext = {
            operationId,
            operation: 'delete',
            path: filePath,
            duration,
            timestamp: new Date().toISOString(),
            metadata: {
              extension: path.extname(filePath),
              directory: path.dirname(filePath)
            }
          };

          logger.info('File deletion completed', {
            ...context,
            component: 'filesystem',
            action: 'file_delete'
          });
        },
        error: (error: Error) => {
          const duration = logger.endTimer(startTime);
          
          logger.error('File deletion failed', error, {
            operationId,
            operation: 'delete',
            path: filePath,
            duration,
            timestamp: new Date().toISOString(),
            component: 'filesystem',
            action: 'file_delete_failed'
          });

          throw error;
        }
      };
    }
  };
};

// Create wrapped versions of fs functions with logging
export const createLoggingFS = () => {
  const fileLogger = createFileLogger();

  return {
    readFile: (filePath: string, options?: any): Promise<Buffer> => {
      const logger = fileLogger.logFileRead(filePath);
      
      return fs.promises.readFile(filePath, options)
        .then(data => logger.complete(data))
        .catch(error => {
          logger.error(error);
          throw error;
        });
    },

    writeFile: (filePath: string, data: Buffer | string, options?: any): Promise<void> => {
      const logger = fileLogger.logFileWrite(filePath, data);
      
      return fs.promises.writeFile(filePath, data, options)
        .then(() => logger.complete())
        .catch(error => {
          logger.error(error);
          throw error;
        });
    },

    unlink: (filePath: string): Promise<void> => {
      const logger = fileLogger.logFileDelete(filePath);
      
      return fs.promises.unlink(filePath)
        .then(() => logger.complete())
        .catch(error => {
          logger.error(error);
          throw error;
        });
    }
  };
};
