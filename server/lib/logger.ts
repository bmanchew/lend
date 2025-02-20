import pino from 'pino';
import { randomUUID } from 'crypto';

// Define custom log levels
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

// Define log context interface
interface LogContext {
  requestId?: string;
  userId?: string;
  component?: string;
  action?: string;
  duration?: number;
  businessEvent?: {
    type: string;
    category: string;
    subCategory?: string;
    status: 'success' | 'failure' | 'pending';
    metadata?: any;
  };
  [key: string]: any;
}

class Logger {
  private logger: pino.Logger;
  private defaultContext: LogContext = {};

  constructor() {
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      formatters: {
        level: (label) => {
          return { level: label.toUpperCase() };
        },
      },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [
          'password',
          'token',
          'secret',
          'authorization',
          '*.password',
          '*.token',
          '*.secret',
          '*.authorization'
        ],
        remove: true
      }
    });
  }

  private formatMessage(message: string, context: LogContext = {}): object {
    return {
      ...this.defaultContext,
      ...context,
      message,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      requestId: context.requestId || this.defaultContext.requestId || randomUUID()
    };
  }

  setDefaultContext(context: LogContext) {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  trace(message: string, context: LogContext = {}) {
    this.logger.trace(this.formatMessage(message, context));
  }

  debug(message: string, context: LogContext = {}) {
    this.logger.debug(this.formatMessage(message, context));
  }

  info(message: string, context: LogContext = {}) {
    this.logger.info(this.formatMessage(message, context));
  }

  warn(message: string, context: LogContext = {}) {
    this.logger.warn(this.formatMessage(message, context));
  }

  error(message: string, error?: Error, context: LogContext = {}) {
    const errorContext = {
      ...context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: error.cause
      } : undefined
    };
    this.logger.error(this.formatMessage(message, errorContext));
  }

  fatal(message: string, error?: Error, context: LogContext = {}) {
    const errorContext = {
      ...context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: error.cause
      } : undefined
    };
    this.logger.fatal(this.formatMessage(message, errorContext));
  }

  // Business event logging
  logBusinessEvent(
    eventType: string,
    category: string,
    status: 'success' | 'failure' | 'pending',
    metadata?: any,
    context: LogContext = {}
  ) {
    const businessContext = {
      ...context,
      businessEvent: {
        type: eventType,
        category,
        status,
        metadata
      }
    };
    this.info(`Business event: ${eventType}`, businessContext);
  }

  // Performance logging
  startTimer(): [number, number] {
    return process.hrtime();
  }

  endTimer(start: [number, number]): number {
    const diff = process.hrtime(start);
    return (diff[0] * 1e9 + diff[1]) / 1e6; // Convert to milliseconds
  }

  // Log with performance measurement
  logWithPerformance(level: LogLevel, message: string, start: [number, number], context: LogContext = {}) {
    const duration = this.endTimer(start);
    const perfContext = { ...context, duration };

    switch(level) {
      case 'trace':
        this.trace(message, perfContext);
        break;
      case 'debug':
        this.debug(message, perfContext);
        break;
      case 'info':
        this.info(message, perfContext);
        break;
      case 'warn':
        this.warn(message, perfContext);
        break;
      case 'error':
        this.error(message, undefined, perfContext);
        break;
      case 'fatal':
        this.fatal(message, undefined, perfContext);
        break;
    }
  }

  // Socket.IO event logging
  logSocketEvent(
    eventName: string,
    socketId: string,
    eventData?: any,
    error?: Error,
    context: LogContext = {}
  ) {
    const socketContext = {
      ...context,
      component: 'socket.io',
      socketId,
      event: eventName,
      eventData: this.sanitizeSocketData(eventData)
    };

    if (error) {
      this.error(`Socket.IO event error: ${eventName}`, error, socketContext);
    } else {
      this.info(`Socket.IO event: ${eventName}`, socketContext);
    }
  }

  private sanitizeSocketData(data: any): any {
    if (!data) return data;

    const sanitized = { ...data };
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey'];
    sensitiveFields.forEach(field => {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    });
    return sanitized;
  }

  // Request tracking
  createRequestLogger(requestId: string) {
    return {
      trace: (message: string, context: LogContext = {}) => 
        this.trace(message, { ...context, requestId }),
      debug: (message: string, context: LogContext = {}) => 
        this.debug(message, { ...context, requestId }),
      info: (message: string, context: LogContext = {}) => 
        this.info(message, { ...context, requestId }),
      warn: (message: string, context: LogContext = {}) => 
        this.warn(message, { ...context, requestId }),
      error: (message: string, error?: Error, context: LogContext = {}) => 
        this.error(message, error, { ...context, requestId }),
      fatal: (message: string, error?: Error, context: LogContext = {}) => 
        this.fatal(message, error, { ...context, requestId })
    };
  }
}

export const logger = new Logger();